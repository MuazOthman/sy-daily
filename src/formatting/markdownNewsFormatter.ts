import { getMostFrequentLabels } from "../mostFrequentLabel";
import {
  ProcessedNews,
  ContentLanguage,
  NewsItemWithImportanceScore,
  NewsItemLabel,
} from "../types";
import { Strings } from "./strings";
import { stringify } from "yaml";

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

function getOgImage(language: ContentLanguage, date: string) {
  return `../../../assets/images/${date}-${
    language === "arabic" ? "ar" : "en"
  }.jpg`;
}

function getHeader(
  language: ContentLanguage,
  date: string,
  mostFrequentLabels: NewsItemLabel[]
) {
  const result = {
    title: `${Strings[language].DailyBriefingForDay} ${date}`,
    author: Strings[language].Author,
    pubDatetime: `${date}T20:00:00.000Z`,
    description: `${Strings[language].DailyBriefingForDay} ${date}`,
    ogImage: getOgImage(language, date),
    tags: mostFrequentLabels,
  };
  return stringify(result);
}

function formatNewsItemForMarkdown(
  language: ContentLanguage,
  item: NewsItemWithImportanceScore
): string {
  // const importanceScore = item.importanceScore;
  const labelText = item.labels
    .slice(0, MAX_LABELS_TO_DISPLAY)
    .map((label) => labelEmojis[label.label] || "📰")
    .join(" ");

  const sourceLinks = item.sources
    .map(
      (source, idx) =>
        `<a href="${source}" target="_blank">[${Strings[language].Source}${
          item.sources.length > 1 ? ` ${idx + 1}` : ""
        }]</a>`
    )
    .join(", ");

  return `- ${labelText} ${
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
  const mostFrequentLabels = getMostFrequentLabels(
    newsResponse.newsItems
  ).slice(0, 3);

  const header = getHeader(language, date, mostFrequentLabels);

  const ogImageEmbed = `![${
    Strings[language].DailyBriefingForDay
  } ${date}](${getOgImage(language, date)})`;

  const firstLine = `${Strings[
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

  let collapsibleSection = "";

  if (remainingBatch.length > 0) {
    const formattedRemainingItems = remainingBatch
      .map((item) => formatNewsItemForMarkdown(language, item))
      .join("\n");

    collapsibleSection = `\n\n<details>\n<summary>${Strings[language].ShowMoreItems}</summary>\n\n${formattedRemainingItems}\n</details>`;
  }

  return `---\n${header}\n---\n\n${ogImageEmbed}\n\n${firstLine}${formattedFirstItems}${collapsibleSection}\n`;
}
