import { NewsItem } from "../types";

export const labelEmojis = {
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

export function getEmojiForNewsItem(item: NewsItem): string {
  // Get the label with the highest relation score
  const topLabel = item.labels.reduce((prev, current) =>
    prev.relationScore > current.relationScore ? prev : current
  );

  return labelEmojis[topLabel.label] || "📰";
}
