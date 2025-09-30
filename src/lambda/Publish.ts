import { EventBridgeHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  ContentLanguage,
  ContentLanguages,
  ProcessedNewsSchema,
  SupportedPublishChannel,
  SupportedPublishChannels,
} from "../types";
import { getMostFrequentLabel } from "../mostFrequentLabel";
import { createPublisher } from "../publishers";
import { addDateToBanner } from "../banner/newsBanner";
import { prioritizeNews } from "../prioritizeNews";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

if (!process.env.CONTENT_LANGUAGE) {
  throw new Error("CONTENT_LANGUAGE is not set");
}

if (
  !ContentLanguages.includes(process.env.CONTENT_LANGUAGE as ContentLanguage)
) {
  throw new Error("CONTENT_LANGUAGE is not a valid language");
}

const CONTENT_LANGUAGE = process.env.CONTENT_LANGUAGE as ContentLanguage;

if (!process.env.CHANNEL_TYPE) {
  throw new Error("CHANNEL_TYPE is not set");
}

if (
  !SupportedPublishChannels.includes(
    process.env.CHANNEL_TYPE as SupportedPublishChannel
  )
) {
  throw new Error(
    `CHANNEL_TYPE must be one of: ${SupportedPublishChannels.join(", ")}`
  );
}

const CHANNEL_TYPE = process.env.CHANNEL_TYPE as SupportedPublishChannel;

const MAX_NEWS_ITEMS = process.env.MAX_NEWS_ITEMS
  ? parseInt(process.env.MAX_NEWS_ITEMS)
  : 12;

// Validate required environment variables based on formatter
if (!process.env.CHANNEL_ID) {
  throw new Error("CHANNEL_ID is required");
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

    // Prioritize news items

    console.log(
      `🔍 Prioritizing ${newsData.newsResponse.newsItems.length} news items`
    );
    const prioritizedNews = prioritizeNews(newsData.newsResponse.newsItems)
      .slice(0, MAX_NEWS_ITEMS)
      .filter((item) => item.importanceScore > 4000);

    console.log(
      `After prioritizing, ${prioritizedNews.length} news items remain`
    );

    const newsDataWithPrioritizedNews = {
      ...newsData,
      newsResponse: { ...newsData.newsResponse, newsItems: prioritizedNews },
    };

    // Create publisher instance using factory
    const publisher = createPublisher(CHANNEL_TYPE);

    const formattedNews = publisher.formatNews(
      newsDataWithPrioritizedNews,
      CONTENT_LANGUAGE
    );
    if (!formattedNews) {
      console.log("No news items found, skipping posting.");
      return;
    }

    const mostFrequentLabel = getMostFrequentLabel(formattedNews.newsItems);
    console.log(`🔍 Most frequent label: ${mostFrequentLabel}`);

    console.log(`Posting summary using ${CHANNEL_TYPE} formatter...`);

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

    try {
      await publisher.setup();

      // Publish using the unified interface
      const postId = await publisher.publishNews(
        process.env.CHANNEL_ID!,
        banner,
        formattedNews.message
      );

      console.log(
        `Successfully posted summary to ${CHANNEL_TYPE}. Post ID: ${postId}`
      );
    } finally {
      // Ensure cleanup happens regardless of success/failure
      await publisher.destroy();
    }
  } catch (error) {
    console.error("Error in Publish function:", error);
    throw error;
  }
};
