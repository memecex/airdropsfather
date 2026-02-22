import "dotenv/config";
import express from "express";
import { Telegraf, Markup } from "telegraf";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");

const WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || "devsecret";
const BOT_PUBLIC_URL = process.env.BOT_PUBLIC_URL;
const PORT = process.env.PORT || 3000;

const API_BASE_URL = process.env.API_BASE_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;
const BOT_INTERNAL_KEY = process.env.BOT_INTERNAL_KEY;

if (!API_BASE_URL) console.warn("Missing API_BASE_URL");
if (!BOT_API_KEY) console.warn("Missing BOT_API_KEY");

const bot = new Telegraf(TOKEN);
const state = new Map();

/* ------------------ helpers ------------------ */

async function postJSON(path, body) {
  if (!API_BASE_URL || !BOT_API_KEY) return;
  await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bot-key": BOT_API_KEY,
    },
    body: JSON.stringify(body),
  }).catch((e) => console.error("API post error", e));
}

async function getUserFromAPI(telegramUserId) {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/tg/users`,
      { method: "GET" }
    );
    if (!res.ok) return null;
    const list = await res.json();
    return list.find((u) => Number(u.telegram_user_id) === Number(telegramUserId)) || null;
  } catch {
    return null;
  }
}

async function upsertUser(ctx, extra = {}) {
  const u = ctx.from;
  if (!u) return;

  const st = state.get(u.id) || {};
  const payload = {
    telegramUserId: u.id,
    telegramUsername: u.username || null,
    dmOptIn: st.dmOptIn ?? false,
    dmPref: st.dmPref ?? "ALL",
    xHandle: st.xHandle ?? null,
    ...extra,
  };

  state.set(u.id, payload);

  await postJSON("/tg/users/upsert", payload);
}

/* ------------------ verify flow ------------------ */

bot.start(async (ctx) => {
  const text = ctx.message?.text || "";
  const parts = text.split(" ");
  const payload = parts[1] || "";

  await upsertUser(ctx);

  if (payload.startsWith("verify_")) {
    const existing = await getUserFromAPI(ctx.from.id);

    if (existing && existing.dm_opt_in && existing.x_handle) {
      await ctx.reply(
        `✅ You are already verified.\n\nX username: ${existing.x_handle}`
      );
      return;
    }

    await ctx.reply(
      "Welcome to AirdropsFather.\n\nDo you want to receive giveaway notifications via DM?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("Yes (All)", "optin_all"),
          Markup.button.callback("Yes (Important Only)", "optin_important"),
        ],
        [Markup.button.callback("No", "optin_no")],
      ])
    );
    return;
  }

  await ctx.reply("AirdropsFather bot is running.");
});

/* ------------------ opt in ------------------ */

bot.action("optin_all", async (ctx) => {
  await ctx.answerCbQuery();
  state.set(ctx.from.id, { dmOptIn: true, dmPref: "ALL" });
  await upsertUser(ctx);
  await ctx.reply("Great. What is your X (Twitter) username? (Example: @airdropsfather)");
});

bot.action("optin_important", async (ctx) => {
  await ctx.answerCbQuery();
  state.set(ctx.from.id, { dmOptIn: true, dmPref: "IMPORTANT" });
  await upsertUser(ctx);
  await ctx.reply("Great. What is your X (Twitter) username? (Example: @airdropsfather)");
});

bot.action("optin_no", async (ctx) => {
  await ctx.answerCbQuery();
  state.set(ctx.from.id, { dmOptIn: false, dmPref: "ALL" });
  await upsertUser(ctx);
  await ctx.reply("Okay. What is your X (Twitter) username? (Example: @airdropsfather)");
});

/* ------------------ X handle ------------------ */

bot.on("text", async (ctx) => {
  const msg = ctx.message.text.trim();
  if (msg.startsWith("@") && msg.length >= 3) {
    const st = state.get(ctx.from.id) || {};
    st.xHandle = msg;
    state.set(ctx.from.id, st);
    await upsertUser(ctx, { xHandle: msg });
    await ctx.reply(`Saved ✅\nX username: ${msg}\n\nYou can now participate in giveaways.`);
  }
});

/* ------------------ server ------------------ */

const app = express();
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("ok"));

app.post(`/telegram/webhook/${WEBHOOK_SECRET}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

async function ensureWebhook() {
  if (!BOT_PUBLIC_URL) return;
  const url = `${BOT_PUBLIC_URL}/telegram/webhook/${WEBHOOK_SECRET}`;
  await bot.telegram.setWebhook(url);
}

app.listen(PORT, async () => {
  const me = await bot.telegram.getMe();
  bot.botInfo = me;
  await ensureWebhook();
  console.log(`Bot listening on port ${PORT}`);
});
