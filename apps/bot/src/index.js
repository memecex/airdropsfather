import "dotenv/config";
import express from "express";
import { Telegraf, Markup } from "telegraf";

const VERSION = "v1.3.1-groups-membership";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");

const WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || "devsecret";
const BOT_PUBLIC_URL = process.env.BOT_PUBLIC_URL;
const PORT = process.env.PORT || 3000;

const API_BASE_URL = process.env.API_BASE_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;
const BOT_INTERNAL_KEY = process.env.BOT_INTERNAL_KEY;

if (!API_BASE_URL || !BOT_API_KEY) console.warn("WARNING: Missing API_BASE_URL or BOT_API_KEY");

const bot = new Telegraf(TOKEN);

// ephemeral state only for "waiting input" flags (DB is source of truth)
const state = new Map(); // { waitingForX: boolean }

function hasBotAuth() {
  return !!(API_BASE_URL && BOT_API_KEY);
}

async function apiFetch(path, init = {}) {
  if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
  if (!BOT_API_KEY) throw new Error("Missing BOT_API_KEY");
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), "x-bot-key": BOT_API_KEY },
  });
}

async function getDbUser(telegramUserId) {
  if (!hasBotAuth()) return null;
  const res = await apiFetch(`/tg/users/${telegramUserId}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function upsertUser(telegramUserId, payload) {
  if (!hasBotAuth()) return;
  await apiFetch("/tg/users/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramUserId, ...payload }),
  }).catch(() => {});
}

async function upsertGroup(chat) {
  if (!chat || !hasBotAuth()) return;
  if (chat.type !== "group" && chat.type !== "supergroup") return;
  const telegramChatId = chat.id;
  const title = chat.title || null;
  await apiFetch("/tg/groups/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramChatId, title }),
  }).catch(() => {});
}

const optInKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("Yes (All)", "optin_all"), Markup.button.callback("Yes (Important Only)", "optin_important")],
    [Markup.button.callback("No", "optin_no")],
  ]);

bot.command("version", async (ctx) => ctx.reply(`AirdropsFather Bot ${VERSION}`));

bot.command("xchange", async (ctx) => {
  state.set(ctx.from.id, { waitingForX: true });
  await ctx.reply("Send your new X (Twitter) username starting with @ (Example: @airdropsfather)");
});

bot.command("groupid", async (ctx) => {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
    await ctx.reply("Use /groupid inside the target group.");
    return;
  }
  await upsertGroup(chat);
  await ctx.reply(`✅ Group saved.\nTitle: ${chat.title || "(no title)"}\nChat ID: ${chat.id}`);
});

// Auto-register groups when bot membership changes
bot.on("my_chat_member", async (ctx) => {
  try {
    await upsertGroup(ctx.chat);
  } catch {}
});

// Also register when bot is added as a new member
bot.on("new_chat_members", async (ctx) => {
  try {
    const me = await bot.telegram.getMe();
    const added = (ctx.message?.new_chat_members || []).some((m) => m.id === me.id);
    if (added) await upsertGroup(ctx.chat);
  } catch {}
});

bot.start(async (ctx) => {
  const u = ctx.from;
  if (!u) return;

  // always keep telegram_username fresh (but do NOT overwrite dm/x unless provided)
  await upsertUser(u.id, { telegramUsername: u.username || null });

  const dbu = await getDbUser(u.id);

  if (dbu && dbu.onboarding_done === true) {
    const tg = dbu.telegram_username ? `@${dbu.telegram_username}` : "(no tg)";
    const x = dbu.x_handle || "(no x)";
    await ctx.reply(
      `✅ You are already verified.\n\nTG: ${tg}\nX: ${x}\n\nTo change your X username: /xchange`
    );
    return;
  }

  if (dbu && dbu.onboarding_dm_set === true) {
    if (!dbu.x_handle) {
      await ctx.reply("What is your X (Twitter) username? (Example: @airdropsfather)");
      return;
    }

    await upsertUser(u.id, { onboardingDone: true });
    await ctx.reply(
      `✅ You are already verified.\n\nTG: @${dbu.telegram_username}\nX: ${dbu.x_handle}\n\nTo change your X username: /xchange`
    );
    return;
  }

  await ctx.reply("Welcome to AirdropsFather.\n\nDo you want to receive giveaway notifications via DM?", optInKeyboard());
});

bot.action("optin_all", async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.from.id;
  await upsertUser(id, { dmOptIn: true, dmPref: "ALL", onboardingDmSet: true });
  await ctx.reply("Great. What is your X (Twitter) username? (Example: @airdropsfather)");
});

bot.action("optin_important", async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.from.id;
  await upsertUser(id, { dmOptIn: true, dmPref: "IMPORTANT", onboardingDmSet: true });
  await ctx.reply("Great. What is your X (Twitter) username? (Example: @airdropsfather)");
});

bot.action("optin_no", async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.from.id;
  await upsertUser(id, { dmOptIn: false, dmPref: "ALL", onboardingDmSet: true });
  await ctx.reply("Okay. What is your X (Twitter) username? (Example: @airdropsfather)");
});

bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const msg = ctx.message.text.trim();

  const st = state.get(id) || {};
  if (st.waitingForX) {
    if (!msg.startsWith("@") || msg.length < 3) {
      await ctx.reply("Invalid format. Send your X username starting with @");
      return;
    }
    state.set(id, { waitingForX: false });
    await upsertUser(id, { xHandle: msg });

    const after = await getDbUser(id);
    const tg = after?.telegram_username ? `@${after.telegram_username}` : "(no tg)";
    await ctx.reply(`✅ Updated.\n\nTG: ${tg}\nX: ${msg}\n\nTo change again: /xchange`);
    return;
  }

  const dbu = await getDbUser(id);
  if (dbu?.onboarding_done === true) return;

  if (msg.startsWith("@") && msg.length >= 3) {
    await upsertUser(id, { xHandle: msg });

    const after = await getDbUser(id);
    if (after?.onboarding_dm_set === true && after?.x_handle) {
      await upsertUser(id, { onboardingDone: true });
      await ctx.reply(
        `✅ Verified.\n\nTG: @${after.telegram_username}\nX: ${after.x_handle}\n\nTo change your X username: /xchange`
      );
    } else {
      await ctx.reply(`Saved ✅\nX username: ${msg}`);
    }
  }
});

/* internal server */
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

// membership check for JOIN_TG task validation
app.post("/internal/check_member", async (req, res) => {
  const key = req.headers["x-internal-key"];
  if (!BOT_INTERNAL_KEY || key !== BOT_INTERNAL_KEY) return res.status(401).json({ error: "Unauthorized" });

  const { chatId, userId } = req.body || {};
  if (!chatId || !userId) return res.status(400).json({ error: "chatId + userId required" });

  try {
    const m = await bot.telegram.getChatMember(Number(chatId), Number(userId));
    const status = m?.status;
    const isMember = status && status !== "left" && status !== "kicked";
    return res.json({ ok: true, status, isMember });
  } catch (e) {
    return res.json({ ok: false, error: String(e?.message || e) });
  }
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
