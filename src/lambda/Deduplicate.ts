import { EventBridgeHandler } from "aws-lambda";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { deduplicate } from "../ai/deduplicate";
import {
  CollectedNewsDataSchema,
  SimplifiedNewsWithMetadata,
  CollectedNewsDataEvent,
} from "../types";
import { getBriefing, updateBriefingDeduplicated } from "../db/BriefingEntity";
import { getCurrentUsage, resetCurrentUsage } from "../ai/getLLMProvider";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

export const handler: EventBridgeHandler<
  "NewsCollected",
  CollectedNewsDataEvent,
  void
> = async (event) => {
  console.log("Received EventBridge event:", JSON.stringify(event));

  try {
    console.log("Starting deduplication for:", event.time);

    // Extract S3 details from EventBridge event
    const bucket = BUCKET_NAME;
    const key = `collected-news/${event.detail.date}.json`;

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
    const content = await response.Body.transformToString();
    const collectedNews = CollectedNewsDataSchema.parse(JSON.parse(content));

    const briefing = await getBriefing(collectedNews.date);
    if (!briefing) {
      throw new Error(`Briefing ${collectedNews.date} not found in database`);
    }
    if (briefing.deduplicatedTime !== undefined) {
      throw new Error(`Briefing ${collectedNews.date} already deduplicated`);
    }

    resetCurrentUsage();

    const deduplicatedNews = await deduplicate(collectedNews.newsItems);
    const processedNews: SimplifiedNewsWithMetadata = {
      items: deduplicatedNews,
      numberOfPosts: collectedNews.numberOfPosts,
      numberOfSources: collectedNews.numberOfSources,
      date: collectedNews.date,
    };
    // Upload to S3 with date as key
    const s3Key = key.replace("collected-news", "deduplicated-news");

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(processedNews, null, 2),
        ContentType: "application/json",
      })
    );
    await updateBriefingDeduplicated({
      date: collectedNews.date,
      deduplicatedTime: new Date(),
      deduplicatedUsage: getCurrentUsage(),
    });

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: process.env.BUS_NAME,
            Source: "news.deduplication",
            DetailType: "NewsDeduplicated",
            Detail: JSON.stringify({ date: collectedNews.date }),
          },
        ],
      })
    );
    console.log(`Successfully uploaded news data to S3: ${s3Key}`);
  } catch (error) {
    console.error("Error in Deduplicate function:", error);
    throw error;
  }
};
