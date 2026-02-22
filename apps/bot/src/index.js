import "dotenv/config";
import express from "express";
import { Telegraf, Markup } from "telegraf";

const VERSION = "v1.1.1-full";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");

const WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || "devsecret";
const BOT_PUBLIC_URL = process.env.BOT_PUBLIC_URL;
const PORT = process.env.PORT || 3000;

const API_BASE_URL = process.env.API_BASE_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;
const BOT_INTERNAL_KEY = process.env.BOT_INTERNAL_KEY;

if (!API_BASE_URL) console.warn("WARNING: Missing API_BASE_URL");
if (!BOT_API_KEY) console.warn("WARNING: Missing BOT_API_KEY");

const bot = new Telegraf(TOKEN);
const state = new Map(); // telegramUserId -> { dmOptIn, dmPref, xHandle }

function hasBotAuth() {
  return !!(API_BASE_URL && BOT_API_KEY);
}

async function apiFetch(path, init = {}) {
  if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
  if (!BOT_API_KEY) throw new Error("Missing BOT_API_KEY");
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "x-bot-key": BOT_API_KEY,
    },
  });
}

async function getExistingUser(telegramUserId) {
  if (!hasBotAuth()) return null;
  const res = await apiFetch(`/tg/users/${telegramUserId}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function upsertUser(ctx, extra = {}) {
  const u = ctx.from;
  if (!u || !hasBotAuth()) return;

  const st = state.get(u.id) || {};
  const payload = {
    telegramUserId: u.id,
    telegramUsername: u.username || null,
    dmOptIn: st.dmOptIn ?? false,
    dmPref: st.dmPref ?? "ALL",
    xHandle: st.xHandle ?? null,
    ...extra,
  };

  state.set(u.id, { dmOptIn: payload.dmOptIn, dmPref: payload.dmPref, xHandle: payload.xHandle });

  await apiFetch("/tg/users/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ✅ Your rule: if tg username + x_handle exist -> verified, NEVER ask again
function isVerified(dbUser) {
  return !!(dbUser && dbUser.telegram_username && dbUser.x_handle);
}

function optInKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Yes (All)", "optin_all"), Markup.button.callback("Yes (Important Only)", "optin_important")],
    [Markup.button.callback("No", "optin_no")],
  ]);
}

bot.command("version", async (ctx) => {
  await ctx.reply(`AirdropsFather Bot `);
});

bot.command("update_x", async (ctx) => {
  await ctx.reply("Send your new X (Twitter) username starting with @ (Example: )");
  state.set(ctx.from.id, { ...(state.get(ctx.from.id) || {}), waitingForXUpdate: true });
});
});

bot.start(async (ctx) => {
  // Upsert basics first (captures tg username)
  await upsertUser(ctx);

  const existing = await getExistingUser(ctx.from.id);
  if (isVerified(existing)) {
    await ctx.reply(`✅ You are already verified.\n\nTG: @${existing.telegram_username}\nX: ${existing.x_handle}`);
    return;
  }

  await ctx.reply(
    "Welcome to AirdropsFather.\n\nDo you want to receive giveaway notifications via DM?",
    optInKeyboard()
  );
});

bot.action("optin_all", async (ctx) => {
  await ctx.answerCbQuery();
  state.set(ctx.from.id, { ...(state.get(ctx.from.id) || {}), dmOptIn: true, dmPref: "ALL" });
  await upsertUser(ctx);
  await ctx.reply("Great. What is your X (Twitter) username? (Example: @airdropsfather)");
});

bot.action("optin_important", async (ctx) => {
  await ctx.answerCbQuery();
  state.set(ctx.from.id, { ...(state.get(ctx.from.id) || {}), dmOptIn: true, dmPref: "IMPORTANT" });
  await upsertUser(ctx);
  await ctx.reply("Great. What is your X (Twitter) username? (Example: @airdropsfather)");
});

bot.action("optin_no", async (ctx) => {
  await ctx.answerCbQuery();
  state.set(ctx.from.id, { ...(state.get(ctx.from.id) || {}), dmOptIn: false, dmPref: "ALL" });
  await upsertUser(ctx);
  await ctx.reply("Okay. What is your X (Twitter) username? (Example: @airdropsfather)");
});

bot.on("text", async (ctx) => {
  const msg = ctx.message.text.trim();

  const st = state.get(ctx.from.id) || {};
  if (st.waitingForXUpdate && msg.startsWith("@") && msg.length >= 3) {
    state.set(ctx.from.id, { ...st, waitingForXUpdate: false, xHandle: msg });
    await upsertUser(ctx, { xHandle: msg });
    await ctx.reply(`✅ Updated X username: `);
    return;
  }

  const existing = await getExistingUser(ctx.from.id);
  if (isVerified(existing)) return;

  if (msg.startsWith("@") && msg.length >= 3) {
    state.set(ctx.from.id, { ...(state.get(ctx.from.id) || {}), xHandle: msg });
    await upsertUser(ctx, { xHandle: msg });

    const after = await getExistingUser(ctx.from.id);
    if (isVerified(after)) {
      await ctx.reply(`✅ Verified.\n\nTG: @${after.telegram_username}\nX: ${after.x_handle}`);
    } else {
      await ctx.reply(`Saved ✅\nX username: ${msg}`);
    }
  }
});

// internal broadcast endpoint
const app = express();
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("ok"));

app.post("/internal/broadcast", async (req, res) => {
  const key = req.headers["x-internal-key"];
  if (!BOT_INTERNAL_KEY || key !== BOT_INTERNAL_KEY) return res.status(401).json({ error: "Unauthorized" });

  const { message, recipients } = req.body || {};
  if (!message || !Array.isArray(recipients)) return res.status(400).json({ error: "message + recipients required" });

  const results = { ok: 0, fail: 0 };
  for (const chatId of recipients) {
    try {
      await bot.telegram.sendMessage(chatId, message);
      results.ok += 1;
    } catch {
      results.fail += 1;
    }
  }
  res.json(results);
});

app.post(`/telegram/webhook/${WEBHOOK_SECRET}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

async function ensureWebhook() {
  if (!BOT_PUBLIC_URL) return;
  const url = `${BOT_PUBLIC_URL}/telegram/webhook/${WEBHOOK_SECRET}`;
  await bot.telegram.setWebhook(url);
  console.log("Webhook set to:", url);
}

app.listen(PORT, async () => {
  const me = await bot.telegram.getMe();
  bot.botInfo = me;
  await ensureWebhook();
  console.log(`Bot listening on port ${PORT} - ${VERSION}`);
});
