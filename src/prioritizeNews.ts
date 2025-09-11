import {
  NewsItem,
  NewsItemLabel,
  NewsItemLabelRelation,
  NewsItemWithImportanceScore,
} from "./types";

export const NewsItemLabelWeights: Record<NewsItemLabel, number> = {
  aid: 80,
  business: 60,
  culture: 40,
  "defense-incident": 100,
  economy: 80,
  education: 60,
  entertainment: 20,
  environment: 30,
  "foreign-affairs": 70,
  "government-services": 60,
  health: 60,
  infrastructure: 70,
  politics: 60,
  president: 80,
  science: 30,
  "security-incident": 80,
  sports: 20,
  technology: 60,
};

function getWeightForLabels(labels: NewsItemLabelRelation[]): number {
  return labels.reduce(
    (acc, label) =>
      // if the label is not in the NewsItemLabelWeights, give it a weight of 0.1
      acc + (NewsItemLabelWeights[label.label] || 0.1) * label.relationScore,
    0
  );
}

export function prioritizeNews(
  newsItems: NewsItem[]
): NewsItemWithImportanceScore[] {
  const weightedNewsItems = newsItems.map((item) => {
    return {
      ...item,
      importanceScore: getWeightForLabels(item.labels),
    };
  });
  return weightedNewsItems.sort(
    (a, b) => b.importanceScore - a.importanceScore
  );
}
