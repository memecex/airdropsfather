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

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

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

function requireBotKey(req, res, next) {
  const key = req.headers["x-bot-key"];
  if (!BOT_API_KEY || key !== BOT_API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

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

  const r = await pool.query("SELECT * FROM admin_users WHERE username=$1", ["admin"]);
  if (r.rows.length === 0) {
    const hash = await bcrypt.hash("123123", 10);
    await pool.query(
      `INSERT INTO admin_users (username,email,password_hash) VALUES ($1,$2,$3)`,
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
      onboarding_dm_set BOOLEAN DEFAULT false,
      onboarding_done BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Add missing columns safely (in case table existed)
  await pool.query(`
    ALTER TABLE telegram_users
      ADD COLUMN IF NOT EXISTS onboarding_dm_set BOOLEAN DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE telegram_users
      ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN DEFAULT false;
  `);

  // ✅ Real SQL-based verified flag (stored, survives restarts)
  // If it already exists, this will fail; so we do it in a DO block.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='telegram_users' AND column_name='is_verified'
      ) THEN
        ALTER TABLE telegram_users
        ADD COLUMN is_verified BOOLEAN
        GENERATED ALWAYS AS (
          (telegram_username IS NOT NULL AND telegram_username <> '')
          AND
          (x_handle IS NOT NULL AND x_handle <> '')
        ) STORED;
      END IF;
    END $$;
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

async function ensureGiveawayTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_catalog (
      code TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO task_catalog (code, label, description)
    VALUES
      (\x27LIKE\x27, \x27Like the post\x27, \x27User must like the X post\x27),
      (\x27RT\x27, \x27Retweet the post\x27, \x27User must retweet the X post\x27),
      (\x27COMMENT\x27, \x27Comment on the post\x27, \x27User must comment/reply\x27),
      (\x27JOIN_TG\x27, \x27Join Telegram group\x27, \x27User must be a member of selected Telegram group\x27)
    ON CONFLICT (code) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      x_account TEXT NOT NULL,
      x_post_url TEXT NOT NULL,
      x_post_id TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      winners_count INT NOT NULL DEFAULT 1,
      announce_in_tg BOOLEAN DEFAULT true,
      announce_in_x BOOLEAN DEFAULT true,
      tg_chat_id BIGINT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS giveaway_tasks (
      id SERIAL PRIMARY KEY,
      giveaway_id INT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload JSONB DEFAULT '{}'::jsonb,
      is_required BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      id SERIAL PRIMARY KEY,
      giveaway_id INT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
      x_handle TEXT,
      telegram_user_id BIGINT,
      telegram_username TEXT,
      wallet_address TEXT,
      discord_handle TEXT,
      comment_id TEXT,
      is_eligible BOOLEAN DEFAULT false,
      checked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS giveaway_winners (
      id SERIAL PRIMARY KEY,
      giveaway_id INT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
      entry_id INT NOT NULL REFERENCES giveaway_entries(id) ON DELETE CASCADE,
      position INT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO system_settings (key, value)
    VALUES
      ('SITE_TITLE','AirdropsFather'),
      ('SITE_DESC','Giveaway engine with verified participants')
    ON CONFLICT (key) DO NOTHING;
  `);
}

app.get("/", (_req, res) => res.json({ status: "API running" }));

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const r = await pool.query("SELECT * FROM admin_users WHERE username=$1", [username]);
  if (r.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, mustChangePassword: user.must_change_password });
});

/* ---------------- BOT APIs ---------------- */

// ✅ upsert DOES NOT overwrite fields unless they are provided
app.post("/tg/users/upsert", requireBotKey, async (req, res) => {
  const body = req.body || {};
  const telegramUserId = body.telegramUserId;
  const telegramUsername = body.telegramUsername ?? null;

  if (!telegramUserId) return res.status(400).json({ error: "telegramUserId required" });

  const hasDmOptIn = Object.prototype.hasOwnProperty.call(body, "dmOptIn");
  const hasDmPref = Object.prototype.hasOwnProperty.call(body, "dmPref");
  const hasXHandle = Object.prototype.hasOwnProperty.call(body, "xHandle");
  const hasDmSet = Object.prototype.hasOwnProperty.call(body, "onboardingDmSet");
  const hasDone = Object.prototype.hasOwnProperty.call(body, "onboardingDone");

  // Insert if not exists
  await pool.query(
    `
    INSERT INTO telegram_users (telegram_user_id, telegram_username, updated_at)
    VALUES ($1,$2,NOW())
    ON CONFLICT (telegram_user_id) DO UPDATE
    SET telegram_username = COALESCE(EXCLUDED.telegram_username, telegram_users.telegram_username),
        updated_at = NOW()
    `,
    [telegramUserId, telegramUsername]
  );

  // Update only provided fields
  const sets = [];
  const vals = [];
  let i = 1;

  // always update username if present
  if (telegramUsername !== null) {
    sets.push(`telegram_username=$${++i}`);
    vals.push(telegramUsername);
  }

  if (hasDmOptIn) {
    sets.push(`dm_opt_in=$${++i}`);
    vals.push(!!body.dmOptIn);
  }
  if (hasDmPref) {
    sets.push(`dm_pref=$${++i}`);
    vals.push(String(body.dmPref || "ALL"));
  }
  if (hasXHandle) {
    // allow null to clear? we will not clear in bot, but keep safe
    sets.push(`x_handle=$${++i}`);
    vals.push(body.xHandle ? String(body.xHandle) : null);
  }
  if (hasDmSet) {
    sets.push(`onboarding_dm_set=$${++i}`);
    vals.push(!!body.onboardingDmSet);
  }
  if (hasDone) {
    sets.push(`onboarding_done=$${++i}`);
    vals.push(!!body.onboardingDone);
  }

  if (sets.length > 0) {
    await pool.query(
      `UPDATE telegram_users SET ${sets.join(", ")}, updated_at=NOW() WHERE telegram_user_id=$1`,
      [telegramUserId, ...vals]
    );
  }

  res.json({ ok: true });
});

// ✅ DB is source of truth
app.get("/tg/users/:telegramUserId", requireBotKey, async (req, res) => {
  const id = Number(req.params.telegramUserId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

  const r = await pool.query(
    `
    SELECT telegram_user_id, telegram_username, dm_opt_in, dm_pref, x_handle,
           onboarding_dm_set, onboarding_done, is_verified,
           created_at, updated_at
    FROM telegram_users
    WHERE telegram_user_id=$1
    LIMIT 1
    `,
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
    VALUES ($1,$2,NOW())
    ON CONFLICT (telegram_chat_id)
    DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
    `,
    [telegramChatId, title || null]
  );

  res.json({ ok: true });
});

/* ---------------- ADMIN APIs ---------------- */

app.get("/admin/tg/users", requireAdmin, async (_req, res) => {
  const r = await pool.query(`
    SELECT telegram_user_id, telegram_username, dm_opt_in, dm_pref, x_handle,
           onboarding_dm_set, onboarding_done, is_verified,
           created_at, updated_at
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

// Giveaways (senin worker için)
app.get("/admin/giveaways", requireAdmin, async (_req, res) => {
  const r = await pool.query(`SELECT * FROM giveaways ORDER BY id DESC LIMIT 200`);
  res.json(r.rows);
});

app.post("/admin/giveaways", requireAdmin, async (req, res) => {
  const { title, description, x_account, x_post_url, winners_count, tg_chat_id } = req.body || {};
  if (!title || !x_account || !x_post_url) return res.status(400).json({ error: "missing fields" });

  const r = await pool.query(
    `INSERT INTO giveaways (title, description, x_account, x_post_url, winners_count, tg_chat_id, status, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',NOW())
     RETURNING *`,
    [title, description || null, x_account, x_post_url, Number(winners_count || 1), tg_chat_id ? Number(tg_chat_id) : null]
  );
  res.json(r.rows[0]);
});

app.post("/admin/giveaways/:id/tasks", requireAdmin, async (req, res) => {
  const giveawayId = Number(req.params.id);
  const { tasks } = req.body || {};
  if (!Number.isFinite(giveawayId)) return res.status(400).json({ error: "bad id" });
  if (!Array.isArray(tasks)) return res.status(400).json({ error: "tasks must be array" });

  await pool.query(`DELETE FROM giveaway_tasks WHERE giveaway_id=$1`, [giveawayId]);
  for (const t of tasks) {
    await pool.query(
      `INSERT INTO giveaway_tasks (giveaway_id, type, payload, is_required) VALUES ($1,$2,$3,$4)`,
      [giveawayId, String(t.type), t.payload || {}, t.is_required !== false]
    );
  }
  res.json({ ok: true });
});

app.post("/admin/giveaways/:id/status", requireAdmin, async (req, res) => {
  const giveawayId = Number(req.params.id);
  const { status } = req.body || {};
  const allowed = new Set(["DRAFT", "RUNNING", "COMPLETED", "CANCELLED"]);
  if (!allowed.has(String(status))) return res.status(400).json({ error: "bad status" });

  const r = await pool.query(
    `UPDATE giveaways SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [giveawayId, String(status)]
  );
  res.json(r.rows[0]);
});

app.get("/admin/task-catalog", requireAdmin, async (_req, res) => {
  const r = await pool.query("SELECT code, label, description FROM task_catalog ORDER BY code ASC");
  res.json(r.rows);
});

app.get("/admin/stats", requireAdmin, async (_req, res) => {
  const u = await pool.query("SELECT COUNT(*)::int AS c FROM telegram_users");
  const g = await pool.query("SELECT COUNT(*)::int AS c FROM tg_groups");
  const w = await pool.query("SELECT COUNT(*)::int AS c FROM giveaways");

  res.json({ users: u.rows[0].c, groups: g.rows[0].c, giveaways: w.rows[0].c });
});

app.listen(PORT, async () => {
  await ensureAdminUser();
  await ensureTelegramTables();
  await ensureGiveawayTables();
  console.log(`API running on port ${PORT}`);
});
