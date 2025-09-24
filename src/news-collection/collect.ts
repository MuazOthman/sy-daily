import _ from "lodash";
import { getPostsInLast24Hours } from "./telegram/getPostsInLast24Hours";
import { processTelegramPost } from "./processSANATelegramPost";

export async function collect(date?: Date) {
  const posts = await getPostsInLast24Hours(date);
  const sources = _.uniq(posts.map((post) => post.channelUsername)).length;

  console.log(`Found ${posts.length} posts from ${sources} unique sources`);

  console.log(`Processing posts...`);

  const processedPosts = await Promise.all(
    posts.map((post) =>
      processTelegramPost(post.message, post.telegramId, post.channelUsername)
    )
  );

  return {
    newsItems: processedPosts,
    numberOfPosts: processedPosts.length,
    numberOfSources: sources,
  };
}
