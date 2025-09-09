import { Strings } from "./strings";
import { ContentLanguage, NewsItemWithImportanceScore } from "./types";

export function formatNewsItemsForTelegram(
  newsItems: NewsItemWithImportanceScore[],
  language: ContentLanguage
): string {
  return newsItems
    .map((item) => {
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
    })
    .join("\n\n");
}
