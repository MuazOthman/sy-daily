import { EventBridgeHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { TelegramBot } from "../telegram/bot";
import {
  CollectedNewsData,
  CollectedNewsDataSchema,
  ContentLanguage,
  ContentLanguages,
} from "../types";
import { prioritizeAndFormat } from "../prioritizeAndFormat";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

if (!process.env.TELEGRAM_CHANNEL_ID) {
  throw new Error("TELEGRAM_CHANNEL_ID is not set");
}

const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

if (!process.env.CONTENT_LANGUAGE) {
  throw new Error("CONTENT_LANGUAGE is not set");
}

if (
  !ContentLanguages.includes(process.env.CONTENT_LANGUAGE as ContentLanguage)
) {
  throw new Error("CONTENT_LANGUAGE is not a valid language");
}

const CONTENT_LANGUAGE = process.env.CONTENT_LANGUAGE as ContentLanguage;

let CHANNEL_ID_NUMBER: number;

if (parseInt(CHANNEL_ID) === null) {
  throw new Error("TELEGRAM_CHANNEL_ID is not a valid number");
} else {
  CHANNEL_ID_NUMBER = parseInt(CHANNEL_ID);
}

export const handler: EventBridgeHandler<"Object Created", any, void> = async (event) => {
  console.log("Received EventBridge event:", JSON.stringify(event));

  try {
    // Extract S3 details from EventBridge event
    const detail = event.detail;
    const bucket = detail.bucket?.name;
    const key = detail.object?.key;

    if (!bucket || !key) {
      throw new Error("Missing bucket or key in EventBridge event detail");
    }

    console.log(`Processing S3 object: ${bucket}/${key}`);

    // Download the cached data from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(getObjectCommand);

    if (!response.Body) {
      throw new Error("No data received from S3");
    }

    const newsDataJson = await response.Body.transformToString();

    const newsData = CollectedNewsDataSchema.parse(JSON.parse(newsDataJson));

    console.log(`Processing news data for date: ${newsData.date}`);

    const formattedNews = prioritizeAndFormat(
      newsData,
      CONTENT_LANGUAGE,
      "telegram"
    );
    if (!formattedNews) {
      console.log("No news items found, skipping posting.");
      return;
    }

    console.log("Posting summary to Telegram...");
    const bot = new TelegramBot(CHANNEL_ID_NUMBER);
    await bot.postMessage(formattedNews);
    console.log("Successfully posted summary to Telegram");
  } catch (error) {
    console.error("Error in PostToTelegram function:", error);
    throw error;
  }
};
