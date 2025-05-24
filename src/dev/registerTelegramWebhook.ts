import { bot } from "../bot";

bot.api
  .setWebhook("https://mosquito-intent-cheetah.ngrok-free.app/webhook")
  .then(() => {
    console.log("Webhook registered");
  })
  .catch((err) => {
    console.error("Error registering webhook", err);
  });

// bot.api.deleteWebhook().then(() => {
//   console.log("Webhook deleted");
// });
