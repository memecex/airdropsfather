import cors from "cors";
import "dotenv/config";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "devsecret";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

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

  const res = await pool.query(
    "SELECT * FROM admin_users WHERE username = $1",
    ["admin"]
  );

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

app.get("/", (_req, res) => {
  res.json({ status: "API running" });
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM admin_users WHERE username = $1",
    [username]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);

  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({
    token,
    mustChangePassword: user.must_change_password,
  });
});

app.listen(PORT, async () => {
  await ensureAdminUser();
  console.log(`API running on port ${PORT}`);
});
