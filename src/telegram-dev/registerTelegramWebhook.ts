import { TelegramBot } from "../telegram/bot";

const CHANNEL_ID = Number(process.env.TELEGRAM_CHANNEL_ID_ARABIC);

const bot = new TelegramBot(CHANNEL_ID);

bot.bot.api
  .setWebhook(`${process.env.DEV_PUBLIC_SERVER}/webhook`)
  .then(() => {
    console.log("Webhook registered");
  })
  .catch((err: any) => {
    console.error("Error registering webhook", err);
  });

// bot.api.deleteWebhook().then(() => {
//   console.log("Webhook deleted");
// });
