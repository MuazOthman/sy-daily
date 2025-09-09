import { getPostsInLast24HoursWorker } from "./getPostsInLast24Hours";
import { processTelegramPost } from "./processSANATelegramPost";
import { summarizeAndTranslate } from "./summarizeAndTranslate";
import { postSummary } from "./bot";
import { getMostRecent12AMInDamascus } from "./dateUtils";
import { ContentLanguage, NewsItem, NewsResponse } from "./types";
import _ from "lodash";
import fs from "fs";
import { Strings } from "./strings";
import { formatNewsItemsForTelegram } from "./formatNewsItemsForTelegram";
import { prioritizeNews } from "./prioritizeNews";

const MAX_NEWS_ITEMS = 12;

type CachedData = {
  newsResponse: NewsResponse | null;
  numberOfPosts: number;
  numberOfSources: number;
};

export async function executeForLast24Hours(
  language: ContentLanguage,
  simulate = false
) {
  let cachedData: CachedData = {
    newsResponse: null,
    numberOfPosts: 0,
    numberOfSources: 0,
  };

  // use cachedData.json if it exists
  if (fs.existsSync("cachedData.json")) {
    cachedData = JSON.parse(fs.readFileSync("cachedData.json", "utf8"));
  } else {
    try {
      const posts = await getPostsInLast24HoursWorker();
      const sources = _.uniq(posts.map((post) => post.channelUsername)).length;
      console.log(
        `🔍 Found ${posts.length} posts from ${sources} unique sources`
      );
      const processedPosts = await Promise.all(
        posts.map((post) =>
          processTelegramPost(
            post.message,
            post.telegramId,
            post.channelUsername
          )
        )
      );
      const newsResponse = await summarizeAndTranslate(
        processedPosts,
        simulate
      );

      cachedData = {
        newsResponse,
        numberOfPosts: posts.length,
        numberOfSources: sources,
      };
    } catch (error) {
      console.error("Failed to fetch posts from Telegram:", error);
      return;
    }
  }
  if (
    !cachedData.newsResponse ||
    !cachedData.newsResponse.newsItems ||
    cachedData.newsResponse.newsItems.length === 0
  ) {
    console.log("No summary generated, skipping posting.");
    return;
  }

  console.log(
    `🔍 Found ${cachedData.newsResponse.newsItems.length} news items`
  );

  const prioritizedNews = prioritizeNews(cachedData.newsResponse.newsItems)
    .slice(0, MAX_NEWS_ITEMS)
    .filter((item) => item.importanceScore > 40);

  const formattedNews = formatNewsItemsForTelegram(prioritizedNews, language);
  const msgHtml = `<b>📅 ${Strings[language].DailyBriefingForDay} ${
    new Date(getMostRecent12AMInDamascus() * 1000).toISOString().split("T")[0]
  }</b>

📊 ${Strings[language].ProcessedThisManyPostsFromThisManySources.replace(
    "{numberOfPosts}",
    cachedData.numberOfPosts.toString()
  ).replace("{numberOfSources}", cachedData.numberOfSources.toString())}

${formattedNews}`;

  if (simulate) {
    console.log(msgHtml);
    console.log("\n--- Raw News Items ---");
    console.log(JSON.stringify(cachedData.newsResponse.newsItems, null, 2));
    return;
  }

  await fs.promises.writeFile(
    "cachedData.json",
    JSON.stringify(cachedData, null, 2)
  );

  await postSummary(msgHtml);
}
