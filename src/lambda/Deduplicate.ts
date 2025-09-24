import { EventBridgeHandler } from "aws-lambda";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { deduplicate } from "../ai/deduplicate";
import { ProcessedNewsSchema } from "../types";
import { prioritizeNews } from "../prioritizeNews";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

export const handler: EventBridgeHandler<"Object Created", any, void> = async (
  event
) => {
  console.log("Received EventBridge event:", JSON.stringify(event));

  try {
    console.log("Starting deduplication for:", event.time);

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
    const content = await response.Body.transformToString();
    const summarizedNews = ProcessedNewsSchema.parse(JSON.parse(content));

    const prioritizedNews = prioritizeNews(
      summarizedNews.newsResponse.newsItems
    )
      .slice(0, 100)
      .map((item) => {
        const { importanceScore, ...rest } = item;
        return rest;
      });

    const deduplicatedNews = await deduplicate({
      ...summarizedNews.newsResponse,
      newsItems: prioritizedNews,
    });
    const processedNews = {
      ...summarizedNews,
      newsResponse: deduplicatedNews,
    };
    // Upload to S3 with date as key
    const s3Key = key.replace("summarized-news", "deduplicated-news");

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(processedNews, null, 2),
        ContentType: "application/json",
      })
    );

    console.log(`Successfully uploaded news data to S3: ${s3Key}`);
  } catch (error) {
    console.error("Error in Deduplicate function:", error);
    throw error;
  }
};
