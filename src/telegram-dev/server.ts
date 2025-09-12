import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import { webhookCallback } from "grammy";

import { TelegramBot } from "../telegram/bot";

const CHANNEL_ID = Number(process.env.TELEGRAM_CHANNEL_ID_ARABIC);

const bot = new TelegramBot(CHANNEL_ID);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = Number(process.env.PORT) || 3000;

// Register the webhook route
app.use("/webhook", webhookCallback(bot.bot, "express"));
app.get("/", async (req, res) => {
  await bot.postMessage(`• <b>President announces</b> a new economic reform package targeting small businesses.  
• <b>Health Ministry</b> confirms plans to distribute vaccines nationwide.  
• <b>Opposition leader</b> criticizes recent foreign policy shifts.
`);
  res.send("Hello World");
});

app.listen(PORT, () => {
  console.log(`Bot listening on http://localhost:${PORT}/webhook`);
});
