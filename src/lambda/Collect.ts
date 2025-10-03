import { ScheduledHandler } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { collect } from "../news-collection/collect";
import { CollectedNewsData } from "../types";
import {
  formatDateUTCPlus3,
  getEpochSecondsMostRecent_11_PM_InDamascus,
} from "../utils/dateUtils";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

const ONE_MINUTE_MILLISECONDS = 60 * 1000;

export const handler: ScheduledHandler = async (event) => {
  try {
    const date = event.time ? new Date(event.time) : new Date();
    // render the date portion of the date to YYYY-MM-DD in Damascus timezone
    const lastMidnightInDamascus =
      getEpochSecondsMostRecent_11_PM_InDamascus(date) * 1000;
    const damascusDate = formatDateUTCPlus3(
      new Date(lastMidnightInDamascus - ONE_MINUTE_MILLISECONDS) // 1 minute before midnight, this is to get the previous day's date
    );

    console.log("Starting news collection for:", date);

    const collectedNews = await collect(date);
    const collectedNewsWithDate: CollectedNewsData = {
      ...collectedNews,
      date: damascusDate,
    };
    // Upload to S3 with date as key
    const s3Key = `collected-news/${damascusDate}.json`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(collectedNewsWithDate, null, 2),
        ContentType: "application/json",
      })
    );

    console.log(`Successfully uploaded news data to S3: ${s3Key}`);
  } catch (error) {
    console.error("Error in Collect function:", error);
    throw error;
  }
};
