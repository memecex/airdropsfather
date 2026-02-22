import "dotenv/config";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "devsecret";
const DATABASE_URL = process.env.DATABASE_URL;

const BOT_API_KEY = process.env.BOT_API_KEY;
const BOT_INTERNAL_KEY = process.env.BOT_INTERNAL_KEY;
const BOT_SERVICE_URL = process.env.BOT_SERVICE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}
if (!BOT_API_KEY) console.warn("WARNING: Missing BOT_API_KEY (bot calls will be rejected).");

const pool = new Pool({ connectionString: DATABASE_URL });

async function ensureAdminUser() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      must_change_password BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const res = await pool.query("SELECT * FROM admin_users WHERE username = $1", ["admin"]);
  if (res.rows.length === 0) {
    const hash = await bcrypt.hash("123123", 10);
    await pool.query(
      `INSERT INTO admin_users (username, email, password_hash)
       VALUES ($1, $2, $3)`,
      ["admin", "admin@admin.com", hash]
    );
    console.log("Default admin created.");
  }
}

async function ensureTelegramTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      id SERIAL PRIMARY KEY,
      telegram_user_id BIGINT UNIQUE NOT NULL,
      telegram_username TEXT,
      dm_opt_in BOOLEAN DEFAULT false,
      dm_pref TEXT DEFAULT 'ALL',
      x_handle TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tg_groups (
      id SERIAL PRIMARY KEY,
      telegram_chat_id BIGINT UNIQUE NOT NULL,
      title TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

function requireBotKey(req, res, next) {
  const key = req.headers["x-bot-key"];
  if (!BOT_API_KEY || key !== BOT_API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/", (_req, res) => res.json({ status: "API running" }));

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const result = await pool.query("SELECT * FROM admin_users WHERE username = $1", [username]);
  if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, mustChangePassword: user.must_change_password });
});

/* ---------------- bot -> api ---------------- */

app.post("/tg/users/upsert", requireBotKey, async (req, res) => {
  const { telegramUserId, telegramUsername, dmOptIn, dmPref, xHandle } = req.body || {};
  if (!telegramUserId) return res.status(400).json({ error: "telegramUserId required" });

  await pool.query(
    `
    INSERT INTO telegram_users (telegram_user_id, telegram_username, dm_opt_in, dm_pref, x_handle, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (telegram_user_id)
    DO UPDATE SET
      telegram_username = EXCLUDED.telegram_username,
      dm_opt_in = EXCLUDED.dm_opt_in,
      dm_pref = EXCLUDED.dm_pref,
      x_handle = EXCLUDED.x_handle,
      updated_at = NOW()
    `,
    [telegramUserId, telegramUsername || null, !!dmOptIn, dmPref || "ALL", xHandle || null]
  );

  res.json({ ok: true });
});

/* ✅ THIS is the missing route */
app.get("/tg/users/:telegramUserId", requireBotKey, async (req, res) => {
  const id = Number(req.params.telegramUserId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

  const r = await pool.query(
    `SELECT telegram_user_id, telegram_username, dm_opt_in, dm_pref, x_handle, updated_at
     FROM telegram_users
     WHERE telegram_user_id = $1
     LIMIT 1`,
    [id]
  );

  if (r.rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
});

app.post("/tg/groups/upsert", requireBotKey, async (req, res) => {
  const { telegramChatId, title } = req.body || {};
  if (!telegramChatId) return res.status(400).json({ error: "telegramChatId required" });

  await pool.query(
    `
    INSERT INTO tg_groups (telegram_chat_id, title, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (telegram_chat_id)
    DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
    `,
    [telegramChatId, title || null]
  );

  res.json({ ok: true });
});

/* ---------------- admin endpoints ---------------- */

app.get("/admin/tg/users", requireAdmin, async (_req, res) => {
  const r = await pool.query(`
    SELECT telegram_user_id, telegram_username, dm_opt_in, dm_pref, x_handle, created_at, updated_at
    FROM telegram_users
    ORDER BY updated_at DESC
    LIMIT 500
  `);
  res.json(r.rows);
});

app.get("/admin/tg/groups", requireAdmin, async (_req, res) => {
  const r = await pool.query(`
    SELECT telegram_chat_id, title, created_at, updated_at
    FROM tg_groups
    ORDER BY updated_at DESC
    LIMIT 200
  `);
  res.json(r.rows);
});

app.listen(PORT, async () => {
  await ensureAdminUser();
  await ensureTelegramTables();
  console.log(`API running on port ${PORT}`);
});
