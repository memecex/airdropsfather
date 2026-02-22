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

if (!API_BASE_URL) console.warn("WARNING: Missing API_BASE_URL");
if (!BOT_API_KEY) console.warn("WARNING: Missing BOT_API_KEY");
if (!BOT_INTERNAL_KEY) console.warn("WARNING: Missing BOT_INTERNAL_KEY (broadcast disabled)");

const bot = new Telegraf(TOKEN);
const state = new Map(); // telegramUserId -> { dmOptIn, dmPref, xHandle }

async function apiFetch(path, init) {
  if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
  const headers = {
    ...(init?.headers || {}),
    "x-bot-key": BOT_API_KEY || "",
  };
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
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

  state.set(u.id, {
    dmOptIn: payload.dmOptIn,
    dmPref: payload.dmPref,
    xHandle: payload.xHandle,
  });

  if (!API_BASE_URL || !BOT_API_KEY) return;

  const res = await apiFetch("/tg/users/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("API upsert failed", res.status, txt);
  }
}

async function getExistingUser(telegramUserId) {
  if (!API_BASE_URL || !BOT_API_KEY) return null;
  const res = await apiFetch(`/tg/users/${telegramUserId}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

function groupOnboardingMessage() {
  return [
    "✅ *AirdropsFather Verification*",
    "",
    "To receive giveaway notifications and verify your participation, tap the button below.",
    "You will be asked for your X (Twitter) username.",
    "",
    "_Note: The bot can DM you only after you start a chat._",
  ].join("\n");
}

function verifyDeepLink(chatId) {
  return `https://t.me/${bot.botInfo?.username}?start=verify_${chatId}`;
}

bot.start(async (ctx) => {
  const text = ctx.message?.text || "";
  const payload = (text.split(" ")[1] || "");

  // store basics (username) as soon as they start chat
  await upsertUser(ctx);

  if (payload.startsWith("verify_")) {
    const existing = await getExistingUser(ctx.from.id);

    // already verified if opted-in AND has x handle
    if (existing && existing.dm_opt_in === true && existing.x_handle) {
      await ctx.reply(`✅ You are already verified.\n\nX username: ${existing.x_handle}`);
      return;
    }

    await ctx.reply(
      "Welcome to AirdropsFather.\n\nDo you want to receive giveaway notifications via DM?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Yes (All)", "optin_all"), Markup.button.callback("Yes (Important Only)", "optin_important")],
        [Markup.button.callback("No", "optin_no")],
      ])
    );
    return;
  }

  await ctx.reply("AirdropsFather bot is running.");
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
  if (msg.startsWith("@") && msg.length >= 3) {
    state.set(ctx.from.id, { ...(state.get(ctx.from.id) || {}), xHandle: msg });
    await upsertUser(ctx, { xHandle: msg });
    await ctx.reply(`Saved ✅\nX username: ${msg}\n\nYou can now participate in giveaways.`);
  }
});

bot.on("my_chat_member", async (ctx) => {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) return;

  const newStatus = ctx.update.my_chat_member?.new_chat_member?.status;
  if (newStatus === "member" || newStatus === "administrator") {
    try {
      if (API_BASE_URL && BOT_API_KEY) {
        const res = await apiFetch("/tg/groups/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramChatId: chat.id, title: chat.title || null }),
        });
        if (!res.ok) console.error("group upsert failed", res.status);
      }

      const link = verifyDeepLink(chat.id);
      await ctx.telegram.sendMessage(chat.id, groupOnboardingMessage(), {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.url("Verify & Enable Notifications", link)]]),
      });
    } catch (e) {
      console.error("Failed to onboard group", e?.message || e);
    }
  }
});

// internal broadcast endpoint (API calls this)
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
      await bot.telegram.sendMessage(chatId, message, { disable_web_page_preview: false });
      results.ok += 1;
    } catch (e) {
      results.fail += 1;
      console.error("broadcast failed for", chatId, e?.message || e);
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
  console.log(`Bot listening on port ${PORT}`);
});
