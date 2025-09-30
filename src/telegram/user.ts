import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import * as readline from "readline";
import { CustomFile } from "telegram/client/uploads";
import { CustomMessage } from "telegram/tl/custom/message";
import { AbstractPublisher } from "../publishers/AbstractPublisher";
import {
  CollectedNewsData,
  ContentLanguage,
  FormattedNewsData,
  NewsItem,
  ProcessedNews,
} from "../types";
import {
  labelEmojis,
  measureTelegramRenderedHtml,
  Strings,
} from "../formatting";

export interface PhotoPostOptions {
  caption?: string;
  parseMode?: "markdown" | "html";
  silent?: boolean;
}

export class TelegramUser extends AbstractPublisher {
  client: TelegramClient;

  constructor() {
    super();
    if (!process.env.TELEGRAM_API_ID) {
      throw new Error("TELEGRAM_API_ID is not set");
    }
    if (!process.env.TELEGRAM_API_HASH) {
      throw new Error("TELEGRAM_API_HASH is not set");
    }
    if (!process.env.SESSION_STRING) {
      throw new Error(
        "SESSION_STRING is not set (required in production, disable this check in local development for the first time you run the app)"
      );
    }
    const apiId = parseInt(process.env.TELEGRAM_API_ID!);
    const apiHash = process.env.TELEGRAM_API_HASH!;
    const stringSession = new StringSession(process.env.SESSION_STRING || "");
    this.client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
    });
  }

  async login() {
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
    await this.client.start({
      phoneNumber: async () => await ask("Phone number (with country code): "),
      password: async () =>
        await ask("Two-step verification password (if enabled): "),
      phoneCode: async () => await ask("Code you received: "),
      onError: (err) => console.log("Login error:", err),
    });
    return this.client;
  }

  async sendPhotoToChannel(
    channelUsername: string | number,
    photoBuffer: Buffer,
    options: PhotoPostOptions = {}
  ): Promise<CustomMessage> {
    const { caption = "", parseMode, silent = false } = options;

    // Upload the buffer as file
    const uploadedFile = await this.client.uploadFile({
      file: new CustomFile(
        "photo.jpg",
        photoBuffer.length,
        "photo.jpg",
        photoBuffer
      ),
      workers: 1,
    });

    // Use sendMessage with file instead for better parse mode support
    const result = await this.client.sendMessage(channelUsername, {
      file: uploadedFile,
      message: caption,
      parseMode: parseMode,
      silent: silent,
    });

    return result;
  }

  async logout() {
    await this.client.disconnect();
  }

  // AbstractPublisher implementation
  async setup(): Promise<void> {
    await this.login();
  }

  async publishNews(
    channelId: string,
    banner: Buffer,
    text: string
  ): Promise<string> {
    const result = await this.sendPhotoToChannel(parseInt(channelId), banner, {
      caption: text,
      parseMode: "html",
      silent: false,
    });
    return result.id.toString();
  }

  async destroy(): Promise<void> {
    await this.client.disconnect();
  }

  private formatNewsItemForTelegram(
    language: ContentLanguage,
    item: NewsItem
  ): string {
    const labelText = item.labels
      .map((label) => labelEmojis[label.label] || "📰")
      .join(" ");

    return `${labelText} ${
      language === "arabic" ? item.summaryArabic : item.summaryEnglish
    } - ${item.sources
      .map(
        (source, idx) =>
          `<a href="${source}">${Strings[language].Source}${
            item.sources.length > 1 ? idx + 1 : ""
          }</a>`
      )
      .join(" ")}`;
  }

  private _formatNews({
    language,
    newsResponse,
    date,
    numberOfPosts,
    numberOfSources,
    skipItems = 0,
  }: {
    language: ContentLanguage;
    skipItems?: number;
  } & ProcessedNews): FormattedNewsData {
    const includedItems =
      skipItems > 0
        ? newsResponse.newsItems.slice(0, -skipItems)
        : newsResponse.newsItems;
    const formattedNewsItems = includedItems
      .map((item) => this.formatNewsItemForTelegram(language, item))
      .join("\n\n");

    const msgHtml = `<b>📅 ${Strings[language].DailyBriefingForDay} ${date}</b>

📊 ${Strings[language].ProcessedThisManyPostsFromThisManySources.replace(
      "{numberOfPosts}",
      numberOfPosts.toString()
    ).replace("{numberOfSources}", numberOfSources.toString())}

${formattedNewsItems}`;

    // ensure the message is not too long or else sending it to telegram will fail

    const { length } = measureTelegramRenderedHtml(msgHtml);

    if (length > 4096) {
      console.log(
        `🔍 Message too long (${msgHtml.length} characters), skipping ${skipItems} items`
      );
      return this._formatNews({
        language,
        newsResponse,
        date,
        numberOfPosts,
        numberOfSources,
        skipItems: skipItems + 1,
      });
    }
    return { message: msgHtml, newsItems: includedItems };
  }

  formatNews(
    newsData: ProcessedNews,
    language: ContentLanguage
  ): FormattedNewsData {
    return this._formatNews({ ...newsData, language, skipItems: 0 });
  }
}
