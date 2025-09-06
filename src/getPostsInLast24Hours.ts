import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { getMostRecent12AMInDamascus } from "./dateUtils";
import { TelegramPost, ChannelConfig } from "./types";

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

function loadChannelConfig(): ChannelConfig {
  try {
    const configPath = path.join(process.cwd(), "channels.json");
    const configFile = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(configFile) as ChannelConfig;
  } catch (error) {
    console.error(
      "Error loading channels.json, falling back to SANA only:",
      error
    );
    return { channels: [{ handle: "sana_gov", name: "" }] };
  }
}

async function getPostsFromChannel(
  client: TelegramClient,
  channelUsername: string,
  earliestDate: number,
  latestDate: number
): Promise<TelegramPost[]> {
  const channel = await client.getEntity(channelUsername);
  let detectedDate = latestDate + 1;
  const posts: TelegramPost[] = [];

  while (detectedDate > earliestDate) {
    console.log(
      `🔍 Searching @${channelUsername} for messages from ${detectedDate} = ${new Date(
        detectedDate * 1000
      ).toISOString()}`
    );

    const messages = await client.getMessages(channel, {
      limit: 100,
      offsetDate: detectedDate,
    });

    for (const msg of messages) {
      if (msg instanceof Api.Message) {
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

        let textContent = "";

        // Get main message text
        if (msg.message) {
          textContent = msg.message;
        }

        // Get media caption if available (ignoring the actual media)
        if (msg.media && msg.message) {
          // Message already contains the caption, so we're good
        } else if (msg.media && !msg.message) {
          // Check if there's a caption in the media
          if ("caption" in msg.media && typeof msg.media.caption === "string") {
            textContent = msg.media.caption;
          }
        }

        // Only add posts with text content
        if (textContent.trim()) {
          posts.push({
            message: textContent,
            telegramId: msg.id,
            channelUsername: channelUsername,
          });
        }
      }
    }

    if (messages.length === 0) break;
    detectedDate = messages[messages.length - 1].date;
  }

  return posts;
}

export async function getPostsInLast24Hours(): Promise<TelegramPost[]> {
  const config = loadChannelConfig();
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

  console.log("Telegram Client: Logged in!");

  const latestDate = getMostRecent12AMInDamascus();
  const earliestDate = latestDate - 60 * 60 * 24;

  console.log(
    `🔍 Searching for messages back to ${earliestDate} = ${new Date(
      earliestDate * 1000
    ).toISOString()}`
  );

  const allPosts: TelegramPost[] = [];

  for (const channel of config.channels) {
    try {
      const handle = channel.handle.replace("@", "");
      console.log(
        `\n📱 Processing channel: ${channel.name} (@${channel.handle})`
      );
      const channelPosts = await getPostsFromChannel(
        client,
        handle,
        earliestDate,
        latestDate
      );
      allPosts.push(...channelPosts);
      console.log(
        `📝 Found ${channelPosts.length} posts from ${channel.name} (@${channel.handle})`
      );
    } catch (error) {
      console.error(
        `❌ Error processing channel ${channel.name} (@${channel.handle}):`,
        error
      );
    }
  }

  console.log(`\n📝 Total posts found across all channels: ${allPosts.length}`);

  await client.disconnect();

  return allPosts;
}
