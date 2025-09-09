import { Bot } from "grammy";

export class TelegramBot {
  bot: Bot;
  private channelId: number;

  constructor(channelId: number) {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    }

    if (!channelId) {
      throw new Error("channelId is not set");
    }

    this.bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!, {
      client: {
        fetch: this.customFetch as any,
      },
    });
    this.channelId = channelId;

    this.setupEventHandlers();
  }

  // Custom fetch function for Lambda compatibility
  private async customFetch(input: any, init: any) {
    const { default: nodeFetch } = await import("node-fetch");

    // Clean up AbortSignal if it's not a proper instance
    if (init?.signal && typeof init.signal === "object") {
      if (
        !init.signal.constructor ||
        init.signal.constructor.name !== "AbortSignal"
      ) {
        const { signal, ...cleanInit } = init;
        return nodeFetch(input as any, cleanInit as any) as any;
      }
    }

    return nodeFetch(input as any, init as any) as any;
  }

  private setupEventHandlers() {
    // Add error handling middleware
    this.bot.catch((err) => {
      console.error("Error in bot:", err);
      console.error("Error stack:", err.stack);
    });

    //// Add middleware to log raw updates
    // this.bot.use(async (ctx, next) => {
    //   console.log("Raw update received:", JSON.stringify(ctx.update, null, 2));
    //   try {
    //     await next();
    //   } catch (err) {
    //     console.error("Error in middleware:", err);
    //     throw err;
    //   }
    // });

    // Log all updates
    this.bot.on("message", async (ctx) => {
      console.log("Message received:", ctx.message);
    });

    this.bot.on("channel_post", async (ctx) => {
      console.log("Channel post received:", ctx.chat?.id);
    });

    // Handle any other types of updates
    this.bot.on("callback_query", async (ctx) => {
      console.log("Callback query received:", ctx.callbackQuery);
    });

    this.bot.on("inline_query", async (ctx) => {
      console.log("Inline query received:", ctx.inlineQuery);
    });
  }

  async postMessage(htmlText: string) {
    await this.bot.api.sendMessage(this.channelId, htmlText, {
      parse_mode: "HTML",
    });
    console.log("Message posted to Telegram.");
  }
}
