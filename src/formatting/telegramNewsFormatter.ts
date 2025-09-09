import { Strings } from "./strings";
import { CollectedNewsData, ContentLanguage, NewsItem } from "../types";
import { measureTelegramRenderedHtml } from "./measureTelegramRenderedHtml";

const labelEmojis = {
  president: "🏛️",
  "foreign-affairs": "🌍",
  "security-incident": "🚨",
  "defense-incident": "⚔️",
  aid: "🤝",
  infrastructure: "🏢",
  education: "🎓",
  health: "🏥",
  economy: "💰",
  environment: "🌍",
  technology: "💻",
  culture: "🎭",
  sports: "🏆",
  politics: "🎤",
  business: "💼",
  science: "🔬",
  entertainment: "🎥",
  travel: "🌏",
  food: "🍔",
  services: "🔧",
};

function formatNewsItemForTelegram(
  language: ContentLanguage,
  item: NewsItem
): string {
  const labelText = item.labels
    .map((label) => labelEmojis[label.label] || "📰")
    .join(" ");

  return `- ${labelText} ${
    language === "arabic" ? item.summaryArabic : item.summaryEnglish
  } - ${item.sources
    .map(
      (source, idx) =>
        `<a href="${source}">${Strings[language].Source}${
          item.sources.length > 1 ? idx + 1 : ""
        }</a>`
    )
    .join(" ")}`;
}

export function telegramNewsFormatter({
  language,
  newsResponse,
  date,
  numberOfPosts,
  numberOfSources,
  skipItems = 0,
}: {
  language: ContentLanguage;
  skipItems?: number;
} & CollectedNewsData): string {
  const includedItems =
    skipItems > 0
      ? newsResponse.newsItems.slice(0, -skipItems)
      : newsResponse.newsItems;
  const formattedNewsItems = includedItems
    .map((item) => formatNewsItemForTelegram(language, item))
    .join("\n\n");

  const msgHtml = `<b>📅 ${Strings[language].DailyBriefingForDay} ${date}</b>

📊 ${Strings[language].ProcessedThisManyPostsFromThisManySources.replace(
    "{numberOfPosts}",
    numberOfPosts.toString()
  ).replace("{numberOfSources}", numberOfSources.toString())}

${formattedNewsItems}`;

  // ensure the message is not too long or else sending it to telegram will fail

  const { length } = measureTelegramRenderedHtml(msgHtml);

  if (length > 4096) {
    console.log(
      `🔍 Message too long (${msgHtml.length} characters), skipping ${skipItems} items`
    );
    return telegramNewsFormatter({
      language,
      newsResponse,
      date,
      numberOfPosts,
      numberOfSources,
      skipItems: skipItems + 1,
    });
  }
  return msgHtml;
}
