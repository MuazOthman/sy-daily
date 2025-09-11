import { TelegramClient } from "telegram";
import { Api } from "telegram";
import * as fs from "fs";
import * as path from "path";
import { getMostRecent12AMInDamascus } from "../../utils/dateUtils";
import { TelegramPost, ChannelConfig } from "../../types";
import { TelegramUser } from "../../telegram/user";

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

export async function getPostsInLast24Hours(
  specifiedDate?: Date
): Promise<TelegramPost[]> {
  const config = loadChannelConfig();
  const user = new TelegramUser();
  const client = await user.login();

  console.log("Telegram Client: Logged in!");

  const latestDate = getMostRecent12AMInDamascus(specifiedDate);
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

  await user.logout();

  return allPosts;
}
