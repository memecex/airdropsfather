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

// In-memory state (temporary). DB is the source of truth.
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

  // update local cache
  state.set(u.id, {
    dmOptIn: payload.dmOptIn,
    dmPref: payload.dmPref,
    xHandle: payload.xHandle,
  });

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
  if (!hasBotAuth()) return null;

  const res = await apiFetch(`/tg/users/${telegramUserId}`, { method: "GET" });
  if (res.status === 404) return null;

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("API lookup failed", res.status, txt);
    return null;
  }

  return res.json().catch(() => null);
}

/**
 * Verified definition (as you requested):
 * If DB has BOTH telegram_username AND x_handle -> DO NOT ASK ANY QUESTIONS.
 */
function isAlreadyVerified(dbUser) {
  if (!dbUser) return false;
  return !!(dbUser.telegram_username && dbUser.x_handle);
}

function groupOnboardingMessage() {
  return [
    "✅ *AirdropsFather Verification*",
    "",
    "Tap the button below to verify and receive giveaway notifications.",
    "",
    "_Note: The bot can DM you only after you start a chat._",
  ].join("\n");
}

function verifyDeepLink(chatId) {
  return `https://t.me/${bot.botInfo?.username}?start=verify_${chatId}`;
}

function optInKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Yes (All)", "optin_all"), Markup.button.callback("Yes (Important Only)", "optin_important")],
    [Markup.button.callback("No", "optin_no")],
  ]);
}

/* ------------------ /start ------------------ */

bot.start(async (ctx) => {
  const text = ctx.message?.text || "";
  const payload = (text.split(" ")[1] || "");

  // always upsert basics (captures telegram username if present)
  await upsertUser(ctx);

  // check DB for existing verification
  const existing = await getExistingUser(ctx.from.id);

  // ✅ IMPORTANT: even when payload is empty, if verified -> never ask again
  if (isAlreadyVerified(existing)) {
    await ctx.reply(
      `✅ You are already verified.\n\nTG: @${existing.telegram_username}\nX: ${existing.x_handle}`
    );
    return;
  }

  // If start was from verify deep link -> run onboarding only if not verified yet
  if (payload.startsWith("verify_")) {
    await ctx.reply(
      "Welcome to AirdropsFather.\n\nDo you want to receive giveaway notifications via DM?",
      optInKeyboard()
    );
    return;
  }

  // Normal /start (no payload) for not-yet-verified users:
  await ctx.reply(
    "Welcome to AirdropsFather.\n\nTo verify, choose your DM preference first:",
    optInKeyboard()
  );
});

/* ------------------ opt-in callbacks ------------------ */

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

/* ------------------ X handle capture ------------------ */

bot.on("text", async (ctx) => {
  const msg = ctx.message.text.trim();

  // If already verified, ignore any re-verify prompts
  const existing = await getExistingUser(ctx.from.id);
  if (isAlreadyVerified(existing)) {
    // optional: allow update by sending /update later (we'll add later)
    return;
  }

  if (msg.startsWith("@") && msg.length >= 3) {
    state.set(ctx.from.id, { ...(state.get(ctx.from.id) || {}), xHandle: msg });
    await upsertUser(ctx, { xHandle: msg });

    // after saving, re-check DB to confirm it's now verified
    const after = await getExistingUser(ctx.from.id);
    if (isAlreadyVerified(after)) {
      await ctx.reply(`Saved ✅\n\nYou're now verified.\nTG: @${after.telegram_username}\nX: ${after.x_handle}`);
    } else {
      await ctx.reply(`Saved ✅\nX username: ${msg}`);
    }
  }
});

/* ------------------ group onboarding ------------------ */

bot.on("my_chat_member", async (ctx) => {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) return;

  const newStatus = ctx.update.my_chat_member?.new_chat_member?.status;
  if (newStatus === "member" || newStatus === "administrator") {
    try {
      if (hasBotAuth()) {
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

/* ------------------ internal broadcast endpoint ------------------ */

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

/* ------------------ telegram webhook ------------------ */

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
