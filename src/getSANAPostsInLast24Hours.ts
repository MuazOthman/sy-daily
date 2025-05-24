import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";
import * as readline from "readline";
import { getMostRecent12AMInDamascus } from "./dateUtils";
import { TelegramPost } from "./types";
import { SANA_CHANNEL_USERNAME } from "./constants";

if (!process.env.TELEGRAM_API_ID) {
  throw new Error("TELEGRAM_API_ID is not set");
}
if (!process.env.TELEGRAM_API_HASH) {
  throw new Error("TELEGRAM_API_HASH is not set");
}
if (!process.env.SESSION_STRING) {
  throw new Error("SESSION_STRING is not set (required in production)");
}
const apiId = parseInt(process.env.TELEGRAM_API_ID!);
const apiHash = process.env.TELEGRAM_API_HASH!;
const stringSession = new StringSession(process.env.SESSION_STRING || "");

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

export async function getSANAPostsInLast24Hours(): Promise<TelegramPost[]> {
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await ask("Phone number (with country code): "),
    password: async () =>
      await ask("Two-step verification password (if enabled): "),
    phoneCode: async () => await ask("Code you received: "),
    onError: (err) => console.log("Login error:", err),
  });

  console.log("Telegram CLient: Logged in!");
  //   const session = client.session.save();
  //   console.log("🔐 Save this session string somewhere safe:");
  //   console.log(session);

  const channelUsername = SANA_CHANNEL_USERNAME;

  const channel = await client.getEntity(channelUsername);

  const latestDate = getMostRecent12AMInDamascus();
  const earliestDate = latestDate - 60 * 60 * 24;

  console.log(
    `🔍 Searching for messages back to ${earliestDate} = ${new Date(
      earliestDate * 1000
    ).toISOString()}`
  );

  let detectedDate = latestDate + 1;

  const posts: TelegramPost[] = [];

  while (detectedDate > earliestDate) {
    console.log(
      `🔍 Searching for messages from ${detectedDate} = ${new Date(
        detectedDate * 1000
      ).toISOString()}`
    );
    const messages = await client.getMessages(channel, {
      limit: 100,
      offsetDate: detectedDate,
    });

    console.log(`\n📝 Messages from @${channelUsername}:\n`);

    for (const msg of messages) {
      if (msg instanceof Api.Message && msg.message) {
        if (msg.date <= earliestDate) {
          console.log(
            `Message date ${new Date(
              msg.date * 1000
            ).toISOString()} is before earliest date ${new Date(
              earliestDate * 1000
            ).toISOString()} - breaking`
          );
          break;
        }
        posts.push({
          message: msg.message,
          telegramId: msg.id,
        });
        // const date = new Date(msg.date * 1000);
        // const dateString = date.toISOString();
        // console.log(`[${dateString}] ${msg.message}`);
      }
    }

    detectedDate = messages[messages.length - 1].date;
  }

  console.log(`\n📝 Found ${posts.length} posts`);

  await client.disconnect();

  return posts;
}
