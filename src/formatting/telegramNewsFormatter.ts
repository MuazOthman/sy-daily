import { Strings } from "./strings";
import {
  ProcessedNews,
  ContentLanguage,
  FormattedNewsData,
  NewsItem,
} from "../types";
import { measureTelegramRenderedHtml } from "./measureTelegramRenderedHtml";

const labelEmojis = {
  president: "🏛️",
  "foreign-affairs": "🌍",
  "security-incident": "🚨",
  "defense-incident": "⚔️",
  aid: "🤝",
  infrastructure: "🏢",
  education: "🎓",
  "government-services": "🔧",
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
};

const MAX_LABELS_TO_DISPLAY = 1;

function formatNewsItemForTelegram(
  language: ContentLanguage,
  item: NewsItem
): string {
  const labelText = item.labels
    .slice(0, MAX_LABELS_TO_DISPLAY) // take only the top N labels
    .map((label) => labelEmojis[label.label] || "📰")
    .join(" ");

  return `${labelText} ${
    language === "arabic" ? item.summaryArabic : item.summaryEnglish
  }`;
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
} & ProcessedNews): FormattedNewsData {
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

${formattedNewsItems}\n\n${Strings[language].TelegramFooter.replace(
    "{date}",
    date
  )}`;

  // ensure the message is not too long or else sending it to telegram will fail

  const { length } = measureTelegramRenderedHtml(msgHtml);

  if (length > 2400) {
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
  return { message: msgHtml, newsItems: includedItems };
}
