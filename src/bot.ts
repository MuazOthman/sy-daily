import { Bot } from "grammy";
import { TELEGRAM_CHANNEL_ID } from "./constants";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}
export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const channelId = TELEGRAM_CHANNEL_ID;

// Add error handling middleware
bot.catch((err) => {
  console.error("Error in bot:", err);
  console.error("Error stack:", err.stack);
});

//// Add middleware to log raw updates
// bot.use(async (ctx, next) => {
//   console.log("Raw update received:", JSON.stringify(ctx.update, null, 2));
//   try {
//     await next();
//   } catch (err) {
//     console.error("Error in middleware:", err);
//     throw err;
//   }
// });

export async function postSummary(htmlText: string) {
  await bot.api.sendMessage(channelId, htmlText, {
    parse_mode: "HTML",
  });
  console.log("Summary posted to Telegram.");
}

// Log all updates
bot.on("message", async (ctx) => {
  console.log("Message received:", ctx.message);
});

bot.on("channel_post", async (ctx) => {
  console.log("Channel post received:", ctx.chat?.id);
});

// Handle any other types of updates
bot.on("callback_query", async (ctx) => {
  console.log("Callback query received:", ctx.callbackQuery);
});

bot.on("inline_query", async (ctx) => {
  console.log("Inline query received:", ctx.inlineQuery);
});
