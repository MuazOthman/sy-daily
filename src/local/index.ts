import { config } from "dotenv";
config();

import { getMostRecent12AMInDamascus } from "../utils/dateUtils";
import { CollectedNewsData, ContentLanguage } from "../types";
import fs from "fs";
import path from "path";
import { prioritizeAndFormat } from "../prioritizeAndFormat";
import { collectAndSummarize } from "../news-collection/collectAndSummarize";
import { generateNewsBanner } from "../banner/newsBanner";
import { TelegramUser } from "../telegram/user";
import { getMostFrequentLabel } from "../mostFrequentLabel";

const CACHE_FILE = path.join(process.cwd(), "cache", "cachedData.json");

export async function executeForLast24Hours(
  language: ContentLanguage,
  channelId: number,
  simulate = false
) {
  console.log(CACHE_FILE);

  const date = new Date(getMostRecent12AMInDamascus() * 1000)
    .toISOString()
    .split("T")[0];
  let cachedData: CollectedNewsData = {
    newsResponse: { newsItems: [] },
    numberOfPosts: 0,
    numberOfSources: 0,
    date,
  };

  // use cachedData.json if it exists
  if (fs.existsSync(CACHE_FILE)) {
    cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } else {
    // throw new Error("Cache file does not exist");
    try {
      cachedData = await collectAndSummarize();
    } catch (error) {
      console.error("Failed to fetch posts from Telegram:", error);
      return;
    }
  }
  if (
    !cachedData.newsResponse.newsItems ||
    cachedData.newsResponse.newsItems.length === 0
  ) {
    console.log("No summary generated, skipping posting.");
    return;
  }

  console.log(
    `🔍 Found ${cachedData.newsResponse.newsItems.length} news items`
  );

  const formattedNews = prioritizeAndFormat(cachedData, language, "telegram");

  if (!formattedNews) {
    console.log("No news items found, skipping posting.");
    return;
  }

  const mostFrequentLabel = getMostFrequentLabel(formattedNews.newsItems);

  console.log(`🔍 Most frequent label: ${mostFrequentLabel}`);

  if (simulate) {
    console.log(formattedNews);
    console.log("\n--- Raw News Items ---");
    console.log(JSON.stringify(cachedData.newsResponse.newsItems, null, 2));
    return;
  }

  await fs.promises.writeFile(CACHE_FILE, JSON.stringify(cachedData, null, 2));

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
  // await executeForLast24Hours(
  //   "arabic",
  //   parseInt(process.env.TELEGRAM_CHANNEL_ID_ARABIC!),
  //   simulate
  // );
  // console.log("Posted Arabic summary");

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
