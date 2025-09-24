import { EventBridgeHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  ProcessedNewsSchema,
  ContentLanguage,
  ContentLanguages,
} from "../types";
import { prioritizeAndFormat } from "../prioritizeAndFormat";
import { getMostFrequentLabel } from "../mostFrequentLabel";
import { TelegramUser } from "../telegram/user";
import { addDateToBanner } from "../banner/newsBanner";

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

if (isNaN(parseInt(CHANNEL_ID))) {
  throw new Error("TELEGRAM_CHANNEL_ID is not a valid number");
} else {
  CHANNEL_ID_NUMBER = parseInt(CHANNEL_ID);
}

export const handler: EventBridgeHandler<"Object Created", any, void> = async (
  event
) => {
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

    const newsData = ProcessedNewsSchema.parse(JSON.parse(newsDataJson));

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

    const mostFrequentLabel = getMostFrequentLabel(formattedNews.newsItems);
    console.log(`🔍 Most frequent label: ${mostFrequentLabel}`);

    console.log("Posting summary to Telegram...");

    // Get the pre-composed banner from S3
    const bannerKey = `composedBanners/${CONTENT_LANGUAGE}/${mostFrequentLabel}.jpg`;
    const fallbackKey = `composedBanners/${CONTENT_LANGUAGE}/other.jpg`;
    console.log(`Fetching banner from S3: ${bannerKey}`);

    let bannerResponse;
    try {
      const getBannerCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: bannerKey,
      });
      bannerResponse = await s3Client.send(getBannerCommand);
    } catch (error) {
      console.log(
        `Banner not found at ${bannerKey}, falling back to ${fallbackKey}`
      );
      const getFallbackCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: fallbackKey,
      });
      bannerResponse = await s3Client.send(getFallbackCommand);
    }

    if (!bannerResponse.Body) {
      throw new Error(
        `No banner found at S3 keys: ${bannerKey} or ${fallbackKey}`
      );
    }

    const bannerBuffer = await bannerResponse.Body.transformToByteArray();

    // Add date to the banner
    const banner = await addDateToBanner(
      Buffer.from(bannerBuffer),
      newsData.date
    );

    const user = new TelegramUser();
    await user.login();
    await user.sendPhotoToChannel(CHANNEL_ID_NUMBER, banner, {
      caption: formattedNews.message,
      parseMode: "html",
      silent: false,
    });
    await user.logout();

    console.log("Successfully posted summary to Telegram");
  } catch (error) {
    console.error("Error in PostToTelegram function:", error);
    throw error;
  }
};
