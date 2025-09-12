import _ from "lodash";
import { getMostRecent12AMInDamascus } from "../utils/dateUtils";
import { getPostsInLast24Hours } from "./telegram/getPostsInLast24Hours";
import { processTelegramPost } from "./processSANATelegramPost";
import { summarizeAndTranslate } from "../ai/summarizeAndTranslate";
import { CollectedNewsData } from "../types";

export async function collectAndSummarize(date?: Date) {
  const dateTimestamp = getMostRecent12AMInDamascus(date);
  const dateKey = new Date(dateTimestamp * 1000).toISOString().split("T")[0];

  const posts = await getPostsInLast24Hours(date);
  const sources = _.uniq(posts.map((post) => post.channelUsername)).length;

  console.log(`Found ${posts.length} posts from ${sources} unique sources`);

  console.log(`Processing posts...`);

  const processedPosts = await Promise.all(
    posts.map((post) =>
      processTelegramPost(post.message, post.telegramId, post.channelUsername)
    )
  );

  const newsResponse = await summarizeAndTranslate(
    processedPosts,
    false // simulate = false for production
  );

  const summaryCache: CollectedNewsData = {
    newsResponse,
    numberOfPosts: posts.length,
    numberOfSources: sources,
    date: dateKey,
  };
  return summaryCache;
}
