import { ScheduledHandler } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { collectAndSummarize } from "../news-collection/collectAndSummarize";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

export const handler: ScheduledHandler = async (event) => {
  console.log("Received scheduled event:", JSON.stringify(event));

  try {
    console.log(
      "Starting news collection and summarization for timestamp:",
      event.time
    );

    const date = new Date(event.time);

    const summaryCache = await collectAndSummarize(date);
    // Upload to S3 with date as key
    const s3Key = `news-data/${summaryCache.date}.json`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(summaryCache, null, 2),
        ContentType: "application/json",
      })
    );

    console.log(`Successfully uploaded news data to S3: ${s3Key}`);
  } catch (error) {
    console.error("Error in CollectAndSummarize function:", error);
    throw error;
  }
};
