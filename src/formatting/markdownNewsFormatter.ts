import {
  ProcessedNews,
  NewsItem,
  ContentLanguage,
  NewsItemWithImportanceScore,
} from "../types";
import { Strings } from "./strings";

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

const MAX_LABELS_TO_DISPLAY = 3;

function formatNewsItemForMarkdown(
  language: ContentLanguage,
  item: NewsItemWithImportanceScore
): string {
  const importanceScore = item.importanceScore;
  const labelText = item.labels
    .slice(0, MAX_LABELS_TO_DISPLAY)
    .map((label) => labelEmojis[label.label] || "📰")
    .join(" ");

  const sourceLinks = item.sources
    .map(
      (source, idx) =>
        `[${Strings[language].Source}${
          item.sources.length > 1 ? idx + 1 : ""
        }](${source})`
    )
    .join(" ");

  return `- ${labelText} ${importanceScore} ${
    language === "arabic" ? item.summaryArabic : item.summaryEnglish
  } - ${sourceLinks}`;
}

export type MarkdownFormatterInput = {
  language: ContentLanguage;
} & Omit<ProcessedNews, "newsResponse"> & {
    newsResponse: {
      newsItems: NewsItemWithImportanceScore[];
    };
  };

export function newsResponseToMarkdown({
  language,
  newsResponse,
  date,
  numberOfPosts,
  numberOfSources,
}: MarkdownFormatterInput): string {
  const header = `# 📅 ${
    Strings[language].DailyBriefingForDay
  } ${date}\n\n📊 ${Strings[
    language
  ].ProcessedThisManyPostsFromThisManySources.replace(
    "{numberOfPosts}",
    numberOfPosts.toString()
  ).replace("{numberOfSources}", numberOfSources.toString())}\n\n`;

  const items = newsResponse.newsItems;
  const firstBatch = items.slice(0, 10);
  const remainingBatch = items.slice(10);

  const formattedFirstItems = firstBatch
    .map((item) => formatNewsItemForMarkdown(language, item))
    .join("\n");

  if (remainingBatch.length === 0) {
    return `${header}${formattedFirstItems}`;
  }

  const formattedRemainingItems = remainingBatch
    .map((item) => formatNewsItemForMarkdown(language, item))
    .join("\n");

  const collapsibleSection = `\n\n<details>\n<summary>${Strings[language].ShowMoreItems}</summary>\n\n${formattedRemainingItems}\n</details>`;

  return `${header}${formattedFirstItems}${collapsibleSection}`;
}
