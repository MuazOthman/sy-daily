import { getSANAPostsInLast24Hours } from "./getSANAPostsInLast24Hours";
import { processSANATelegramPost } from "./processSANATelegramPost";
import { summarizeArabicNewsInEnglish } from "./summarizeArabicNewsInEnglish";
import { postSummary } from "./bot";
import { getMostRecent12AMInDamascus } from "./dateUtils";

export async function executeForLast24Hours() {
  const posts = await getSANAPostsInLast24Hours();
  const processedPosts = await Promise.all(
    posts.map((post) => processSANATelegramPost(post.message, post.telegramId))
  );

  const summary = await summarizeArabicNewsInEnglish(processedPosts.reverse());

  const msgHtml = `<b>Summary for ${
    new Date(getMostRecent12AMInDamascus() * 1000).toISOString().split("T")[0]
  }:</b>

${summary}`;

  await postSummary(msgHtml);
}
