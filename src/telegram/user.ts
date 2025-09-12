import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import * as readline from "readline";
import { CustomFile } from "telegram/client/uploads";
import { CustomMessage } from "telegram/tl/custom/message";
export interface PhotoPostOptions {
  caption?: string;
  parseMode?: "markdown" | "html";
  silent?: boolean;
}

export class TelegramUser {
  client: TelegramClient;

  constructor() {
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
}
