const TelegramBot = require("node-telegram-bot-api");

let bot = null;

function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log(
      "⚠️  TELEGRAM_BOT_TOKEN not set — alerts will be logged to console instead of sent."
    );
    return null;
  }
  bot = new TelegramBot(token, { polling: true });

  // Lets a user message the bot to get their chat_id (needed to receive alerts)
  bot.on("message", (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `👋 Welcome to PriceGuard!\nYour Telegram Chat ID is: ${msg.chat.id}\nUse this ID when adding a product to get price-drop alerts here.`
    );
  });

  console.log("🤖 Telegram bot initialized");
  return bot;
}

async function sendTelegramMessage(chatId, text) {
  if (!bot) {
    console.log(`[ALERT - Telegram not configured] To ${chatId}: ${text}`);
    return;
  }
  try {
    await bot.sendMessage(chatId, text);
  } catch (err) {
    console.error("Failed to send Telegram message:", err.message);
  }
}

module.exports = { initBot, sendTelegramMessage };
