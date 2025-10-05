import { EventBridgeHandler } from "aws-lambda";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { summarize } from "../ai/summarize";
import {
  ProcessedNews,
  SimplifiedNewsWithMetadataSchema,
  DeduplicatedNewsDataEvent,
} from "../types";
import {
  getBriefing,
  updateBriefingSummarizedTime,
} from "../db/BriefingEntity";
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
  "NewsDeduplicated",
  DeduplicatedNewsDataEvent,
  void
> = async (event) => {
  console.log("Received EventBridge event:", JSON.stringify(event));

  try {
    console.log("Starting summarization for:", event.time);

    // Extract S3 details from EventBridge event
    const bucket = BUCKET_NAME;
    const key = `deduplicated-news/${event.detail.date}.json`;

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
    const deduplicatedNews = SimplifiedNewsWithMetadataSchema.parse(
      JSON.parse(content)
    );
    const briefing = await getBriefing(deduplicatedNews.date);

    if (!briefing) {
      throw new Error(
        `Briefing ${deduplicatedNews.date} not found in database`
      );
    }
    if (briefing.summarizedTime !== undefined) {
      throw new Error(`Briefing ${deduplicatedNews.date} already summarized`);
    }

    resetCurrentUsage();

    const summarizedNews = await summarize(
      deduplicatedNews.items.map(
        (item) => `${item.text}\n\n${item.sources.join("\n")}`
      )
    );
    const processedNews: ProcessedNews = {
      newsResponse: summarizedNews,
      numberOfPosts: deduplicatedNews.numberOfPosts,
      numberOfSources: deduplicatedNews.numberOfSources,
      date: deduplicatedNews.date,
    };
    const s3Key = key.replace("deduplicated-news", "summarized-news");

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(processedNews, null, 2),
        ContentType: "application/json",
      })
    );
    await updateBriefingSummarizedTime({
      date: deduplicatedNews.date,
      summarizedTime: new Date(),
      summarizedUsage: getCurrentUsage(),
    });

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: process.env.BUS_NAME,
            Source: "news.summarization",
            DetailType: "NewsSummarized",
            Detail: JSON.stringify({ date: deduplicatedNews.date }),
          },
        ],
      })
    );

    console.log(`Successfully uploaded news data to S3: ${s3Key}`);
  } catch (error) {
    console.error("Error in Summarize function:", error);
    throw error;
  }
};
