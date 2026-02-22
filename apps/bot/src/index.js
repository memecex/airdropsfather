import "dotenv/config";
import express from "express";
import { Telegraf, Markup } from "telegraf";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");

const WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || "devsecret";
const BOT_PUBLIC_URL = process.env.BOT_PUBLIC_URL; // e.g. https://xxxx.up.railway.app
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(TOKEN);

// EN templates (later: load from API/DB)
function groupOnboardingMessage() {
  return [
    "✅ *AirdropsFather Verification*",
    "",
    "To receive giveaway notifications and verify your participation, tap the button below.",
    "You will be asked for your X (Twitter) username.",
    "",
    "_Note: The bot can DM you only after you start a chat._"
  ].join("\n");
}

function verifyDeepLink(chatId) {
  return `https://t.me/${bot.botInfo?.username}?start=verify_${chatId}`;
}

bot.start(async (ctx) => {
  const text = ctx.message?.text || "";
  const parts = text.split(" ");
  const payload = parts[1] || "";

  if (payload.startsWith("verify_")) {
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

// Opt-in callbacks (DB later)
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

// Minimal: accept @handle and confirm
bot.on("text", async (ctx) => {
  const msg = ctx.message.text.trim();
  if (!msg.startsWith("@") || msg.length < 3) return;
  await ctx.reply(`Saved ✅\nX username: ${msg}\n\nYou can now participate in giveaways.`);
});

// When bot is added to a group (send onboarding message)
bot.on("my_chat_member", async (ctx) => {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) return;

  const newStatus = ctx.update.my_chat_member?.new_chat_member?.status;
  if (newStatus === "member" || newStatus === "administrator") {
    try {
      const link = verifyDeepLink(chat.id);
      await ctx.telegram.sendMessage(chat.id, groupOnboardingMessage(), {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.url("Verify & Enable Notifications", link)]]),
      });
    } catch (e) {
      console.error("Failed to send onboarding", e);
    }
  }
});

const app = express();
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("ok"));

app.post(`/telegram/webhook/${WEBHOOK_SECRET}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

async function ensureWebhook() {
  if (!BOT_PUBLIC_URL) {
    console.log("BOT_PUBLIC_URL not set; skipping webhook auto-setup.");
    return;
  }
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
