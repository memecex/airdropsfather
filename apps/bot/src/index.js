import "dotenv/config";
import express from "express";
import { Telegraf, Markup } from "telegraf";

const VERSION = "v1.0.9-verify-skip"; // <-- deploy kontrolü

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");

const WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || "devsecret";
const BOT_PUBLIC_URL = process.env.BOT_PUBLIC_URL;
const PORT = process.env.PORT || 3000;

const API_BASE_URL = process.env.API_BASE_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;
const BOT_INTERNAL_KEY = process.env.BOT_INTERNAL_KEY;

const bot = new Telegraf(TOKEN);

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
  if (!hasBotAuth()) return { ok: false, reason: "no_auth", user: null };

  const res = await apiFetch(`/tg/users/${telegramUserId}`, { method: "GET" });

  if (res.status === 404) return { ok: true, reason: "not_found", user: null };

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, reason: `http_${res.status}`, user: null, details: txt };
  }

  const user = await res.json().catch(() => null);
  return { ok: true, reason: "ok", user };
}

// ✅ Verified = DB’de x_handle varsa biter. (tg username şartı KALDIRDIM)
function isVerified(dbUser) {
  return !!(dbUser && dbUser.x_handle);
}

function optInKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Yes (All)", "optin_all"), Markup.button.callback("Yes (Important Only)", "optin_important")],
    [Markup.button.callback("No", "optin_no")],
  ]);
}

bot.command("version", async (ctx) => {
  await ctx.reply(`AirdropsFather Bot ${VERSION}`);
});

bot.start(async (ctx) => {
  const text = ctx.message?.text || "";
  const payload = (text.split(" ")[1] || "");

  const lookup = await getExistingUser(ctx.from.id);

  // log: Railway'de göreceğiz
  console.log("[START]", VERSION, "uid=", ctx.from.id, "lookup=", lookup.reason, "hasUser=", !!lookup.user);

  if (isVerified(lookup.user)) {
    await ctx.reply(`✅ You are already verified.\n\nX: ${lookup.user.x_handle}`);
    return;
  }

  // Not verified -> show flow
  await ctx.reply(
    "Welcome to AirdropsFather.\n\nDo you want to receive giveaway notifications via DM?",
    optInKeyboard()
  );
});

// --- the rest minimal to keep working ---
bot.action("optin_all", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Great. What is your X (Twitter) username? (Example: @airdropsfather)");
});
bot.action("optin_important", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Great. What is your X (Twitter) username? (Example: @airdropsfather)");
});
bot.action("optin_no", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Okay. What is your X (Twitter) username? (Example: @airdropsfather)");
});

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
  console.log("Webhook set to:", url);
}

app.listen(PORT, async () => {
  const me = await bot.telegram.getMe();
  bot.botInfo = me;
  await ensureWebhook();
  console.log(`Bot listening on port ${PORT} - ${VERSION}`);
});
