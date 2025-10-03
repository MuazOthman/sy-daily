import _ from "lodash";
import { getPostsInLast24Hours } from "./telegram/getPostsInLast24Hours";
import { processTelegramPost } from "./processSANATelegramPost";

export async function collect(date?: Date) {
  const postsDictionary: Record<string, string[]> = await getPostsInLast24Hours(
    date
  );
  const sources = _.uniq(Object.keys(postsDictionary)).length;
  const posts = Object.values(postsDictionary).flat();

  console.log(`Found ${posts.length} posts from ${sources} unique sources`);

  console.log(`Processing posts...`);

  const processedPosts = await Promise.all(
    posts.map((post) => processTelegramPost(post))
  );

  return {
    newsItems: processedPosts,
    numberOfPosts: processedPosts.length,
    numberOfSources: sources,
  };
}
