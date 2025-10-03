import { EventBridgeHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { ProcessedNewsSchema } from "../types";
import { prioritizeNews } from "../prioritizeNews";
import { newsResponseToMarkdown } from "../formatting/markdownNewsFormatter";
import { commitFilesToGitHub } from "../github";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, BASE_PATH } =
  process.env;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  throw new Error(
    "Missing required env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO"
  );
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

    const date = newsData.date;

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

    const arabicMarkdownNews = newsResponseToMarkdown({
      language: "arabic",
      newsResponse: {
        newsItems: prioritizedNews,
      },
      date,
      numberOfPosts: newsData.numberOfPosts,
      numberOfSources: newsData.numberOfSources,
    });

    const result = await commitFilesToGitHub({
      files: [
        { path: `en/${date}.md`, content: englishMarkdownNews },
        { path: `ar/${date}.md`, content: arabicMarkdownNews },
      ],
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      token: GITHUB_TOKEN,
      branch: GITHUB_BRANCH,
      basePath: BASE_PATH || "src/data/blog",
      message: `chore(content): add ${date} summaries to website`,
    });
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error in PublishToWebsite function:", error);
    throw error;
  }
};
