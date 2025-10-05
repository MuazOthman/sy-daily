import { EventBridgeHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  ContentLanguage,
  ProcessedNews,
  ProcessedNewsSchema,
  SummarizedNewsDataEvent,
} from "../types";
import { prioritizeNews } from "../prioritizeNews";
import { newsResponseToMarkdown } from "../formatting/markdownNewsFormatter";
import { commitFilesToGitHub } from "../github";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  getBriefing,
  updateBriefingPublishedToWebsiteTime,
} from "../db/BriefingEntity";
import { getMostFrequentLabels } from "../mostFrequentLabel";
import { addDateToBanner } from "../banner/newsBanner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || "us-east-1",
});

if (!process.env.BUCKET_NAME) {
  throw new Error("BUCKET_NAME is not set");
}

const BUCKET_NAME = process.env.BUCKET_NAME;

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = process.env;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  throw new Error(
    "Missing required env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO"
  );
}

async function getBanner(
  processedNews: ProcessedNews,
  contentLanguage: ContentLanguage
) {
  const mostFrequentLabel = getMostFrequentLabels(
    processedNews.newsResponse.newsItems
  )[0];
  console.log(`🔍 Most frequent label: ${mostFrequentLabel}`);

  console.log("Posting summary to Telegram...");

  // Get the pre-composed banner from S3
  const bannerKey = `composedBanners/${contentLanguage}/${mostFrequentLabel}.jpg`;
  const fallbackKey = `composedBanners/${contentLanguage}/other.jpg`;
  console.log(`Fetching banner from S3: ${bannerKey}`);

  let bannerResponse;
  try {
    const getBannerCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: bannerKey,
    });
    bannerResponse = await s3Client.send(getBannerCommand);
  } catch (error) {
    console.log(
      `Banner not found at ${bannerKey}, falling back to ${fallbackKey}`
    );
    const getFallbackCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
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
    processedNews.date
  );
  return banner;
}

export const handler: EventBridgeHandler<
  "NewsSummarized",
  SummarizedNewsDataEvent,
  void
> = async (event) => {
  console.log("Received EventBridge event:", JSON.stringify(event));

  try {
    // Extract S3 details from EventBridge event
    const bucket = BUCKET_NAME;
    const key = `summarized-news/${event.detail.date}.json`;

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

    if (process.env.SIMULATE_WEBSITE_PUBLISH === "true") {
      console.log("Simulating website publish");

      await updateBriefingPublishedToWebsiteTime({
        date: newsData.date,
        publishedToWebsiteTime: new Date(),
      });

      // put event to event bus

      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName: process.env.BUS_NAME,
              Source: "gh.actions",
              DetailType: "summaries-published",
              Detail: JSON.stringify({ date: newsData.date }),
            },
          ],
        })
      );
      return;
    }

    const date = newsData.date;

    const briefing = await getBriefing(newsData.date);

    if (!briefing) {
      throw new Error(`Briefing ${newsData.date} not found in database`);
    }
    if (briefing.publishedToWebsiteTime !== undefined) {
      throw new Error(`Briefing ${newsData.date} already published to website`);
    }

    console.log(`Processing news data for date: ${newsData.date}`);

    const prioritizedNews = prioritizeNews(newsData.newsResponse.newsItems);

    const englishMarkdownNews = newsResponseToMarkdown({
      language: "english",
      newsResponse: {
        newsItems: prioritizedNews,
      },
      date,
      numberOfPosts: newsData.numberOfPosts,
      numberOfSources: newsData.numberOfSources,
    });

    const englishBanner = await getBanner(newsData, "english");
    const englishBannerBase64 = englishBanner.toString("base64");

    const arabicMarkdownNews = newsResponseToMarkdown({
      language: "arabic",
      newsResponse: {
        newsItems: prioritizedNews,
      },
      date,
      numberOfPosts: newsData.numberOfPosts,
      numberOfSources: newsData.numberOfSources,
    });
    const arabicBanner = await getBanner(newsData, "arabic");
    const arabicBannerBase64 = arabicBanner.toString("base64");

    const result = await commitFilesToGitHub({
      files: [
        { path: `src/data/blog/en/${date}.md`, content: englishMarkdownNews },
        { path: `src/data/blog/ar/${date}.md`, content: arabicMarkdownNews },
        {
          path: `src/assets/images/${date}-en.jpg`,
          content: englishBannerBase64,
          encoding: "base64",
        },
        {
          path: `src/assets/images/${date}-ar.jpg`,
          content: arabicBannerBase64,
          encoding: "base64",
        },
      ],
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      token: GITHUB_TOKEN,
      branch: GITHUB_BRANCH,
      basePath: "",
      message: `chore(content): add ${date} summaries to website`,
      force: true,
    });
    console.log("Result:", JSON.stringify(result, null, 2));

    try {
      await updateBriefingPublishedToWebsiteTime({
        date: newsData.date,
        publishedToWebsiteTime: new Date(),
      });
    } catch (error) {
      console.error("Error in updating briefing:", error);
      console.log("Gracefully exiting...");
      return;
    }
  } catch (error) {
    console.error("Error in PublishToWebsite function:", error);
    throw error;
  }
};
