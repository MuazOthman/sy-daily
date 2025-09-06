import { getPostsInLast24Hours } from "./getPostsInLast24Hours";
import { processTelegramPost } from "./processSANATelegramPost";
import { summarizeArabicNewsInEnglish } from "./summarizeArabicNewsInEnglish";
import { postSummary } from "./bot";
import { getMostRecent12AMInDamascus } from "./dateUtils";
import _ from "lodash";

export async function executeForLast24Hours(simulate = false) {
  const posts = await getPostsInLast24Hours();
  const sources = _.uniq(posts.map((post) => post.channelUsername)).length;
  console.log(`🔍 Found ${posts.length} posts from ${sources} unique sources`);
  const processedPosts = await Promise.all(
    posts.map((post) =>
      processTelegramPost(post.message, post.telegramId, post.channelUsername)
    )
  );

  const summary = await summarizeArabicNewsInEnglish(
    processedPosts.reverse(),
    simulate
  );

  if (!summary) {
    console.log("No summary generated, skipping posting.");
    return;
  }

  const msgHtml = `<b>Summary for ${
    new Date(getMostRecent12AMInDamascus() * 1000).toISOString().split("T")[0]
  }:</b>

Summarized ${posts.length} posts from ${sources} sources.

${summary}`;

  if (simulate) {
    console.log(msgHtml);
    return;
  }

  await postSummary(msgHtml);
}
