import { config } from "dotenv";
config();

import { getEpochSecondsMostRecent_11_PM_InDamascus } from "../utils/dateUtils";
import { ProcessedNews, ContentLanguage, CollectedNewsData } from "../types";
import fs, { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { prioritizeAndFormat } from "../prioritizeAndFormat";
import { collect } from "../news-collection/collect";
import { generateNewsBanner } from "../banner/newsBanner";
import { TelegramUser } from "../telegram/user";
import { getMostFrequentLabel } from "../mostFrequentLabel";
import { summarize } from "../ai/summarize";
import { deduplicate } from "../ai/deduplicate";
import { prioritizeNews } from "../prioritizeNews";
import { newsResponseToMarkdown } from "../formatting/markdownNewsFormatter";

const CACHE_COLLECTED_NEWS_FILE = path.join(
  process.cwd(),
  "cache",
  "collectedNews.json"
);
const CACHE_SUMMARIZED_NEWS_FILE = path.join(
  process.cwd(),
  "cache",
  "summarizedNews.json"
);
const CACHE_DEDUPLICATED_NEWS_FILE = path.join(
  process.cwd(),
  "cache",
  "deduplicatedNews.json"
);

const DEDUPE_OUTPUT_FOLDER = path.join(process.cwd(), "cache", "deduplicate");
process.env.DEDUPE_OUTPUT_FOLDER = DEDUPE_OUTPUT_FOLDER;
if (!existsSync(DEDUPE_OUTPUT_FOLDER)) {
  mkdirSync(DEDUPE_OUTPUT_FOLDER, { recursive: true });
}

async function getCollectedNews(date: string) {
  try {
    if (fs.existsSync(CACHE_COLLECTED_NEWS_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_COLLECTED_NEWS_FILE, "utf8"));
    }
    const fetchedNews = await collect();
    const result = {
      ...fetchedNews,
      date,
    };
    fs.writeFileSync(
      CACHE_COLLECTED_NEWS_FILE,
      JSON.stringify(result, null, 2)
    );
    return result;
  } catch (error) {
    console.error("Failed to fetch posts from Telegram:", error);
    return;
  }
}

async function getDeduplicatedNews(date: string) {
  try {
    if (fs.existsSync(CACHE_DEDUPLICATED_NEWS_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_DEDUPLICATED_NEWS_FILE, "utf8"));
    }
  } catch (error) {
    console.error("Failed to deduplicate news:");
    throw error;
  }
  const collectedNews = await getCollectedNews(date);
  const deduplicatedNews = (await deduplicate(collectedNews.newsItems)).map(
    (item) => `${item.text}\n${item.sources.join("\n")}`
  );
  const result: CollectedNewsData = {
    ...collectedNews,
    newsItems: deduplicatedNews,
  };
  fs.writeFileSync(
    CACHE_DEDUPLICATED_NEWS_FILE,
    JSON.stringify(result, null, 2)
  );
  return result;
}

async function getSummarizedNews(date: string) {
  try {
    if (fs.existsSync(CACHE_SUMMARIZED_NEWS_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_SUMMARIZED_NEWS_FILE, "utf8"));
    }
    const deduplicatedNews: CollectedNewsData = await getDeduplicatedNews(date);
    const summarizedNews = await summarize(deduplicatedNews.newsItems);
    const result: ProcessedNews = {
      numberOfPosts: deduplicatedNews.numberOfPosts,
      numberOfSources: deduplicatedNews.numberOfSources,
      date,
      newsResponse: summarizedNews,
    };
    fs.writeFileSync(
      CACHE_SUMMARIZED_NEWS_FILE,
      JSON.stringify(result, null, 2)
    );
    return result;
  } catch (error) {
    console.error("Failed to summarize news:", error);
    return;
  }
}

export async function executeForLast24Hours(
  language: ContentLanguage,
  channelId: number,
  simulate = false
) {
  const date = new Date(getEpochSecondsMostRecent_11_PM_InDamascus() * 1000)
    .toISOString()
    .split("T")[0];

  const news = await getSummarizedNews(date);

  const formattedNews = prioritizeAndFormat(news, language, "telegram");

  if (!formattedNews) {
    console.log("No news items found, skipping posting.");
    return;
  }

  const mostFrequentLabel = getMostFrequentLabel(formattedNews.newsItems);

  console.log(`🔍 Most frequent label: ${mostFrequentLabel}`);

  if (simulate) {
    console.log(formattedNews);
    console.log("\n--- Raw News Items ---");
    console.log(JSON.stringify(news.newsResponse.newsItems, null, 2));
    return;
  }

  // Prioritize, the news
  const prioritizedNews = prioritizeNews(news.newsResponse.newsItems);

  const markdownNews = newsResponseToMarkdown({
    language,
    newsResponse: {
      newsItems: prioritizedNews,
    },
    date,
    numberOfPosts: news.numberOfPosts,
    numberOfSources: news.numberOfSources,
  });

  // write the markdown to a file named after the proper language inside the cache folder
  writeFileSync(
    path.join(process.cwd(), "cache", `${date}.${language}.md`),
    markdownNews
  );
  const banner = await generateNewsBanner(mostFrequentLabel, date, language);

  const user = new TelegramUser();
  await user.login();
  await user.sendPhotoToChannel(channelId, banner, {
    caption: formattedNews.message,
    parseMode: "html",
    silent: false,
  });
  await user.logout();

  // const bot = new TelegramBot(channelId);

  // await bot.postPhoto(banner, formattedNews.message);
}

const simulate = false;

if (simulate) {
  console.log("Running in simulate mode");
}

async function postSummaries() {
  await executeForLast24Hours(
    "arabic",
    parseInt(process.env.TELEGRAM_CHANNEL_ID_ARABIC!),
    simulate
  );
  console.log("Posted Arabic summary");

  await executeForLast24Hours(
    "english",
    parseInt(process.env.TELEGRAM_CHANNEL_ID_ENGLISH!),
    simulate
  );
  console.log("Posted English summary");
}

postSummaries().then(() => {
  console.log("Done");
});
