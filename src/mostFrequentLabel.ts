import { NewsItemLabelWeights } from "./prioritizeNews";
import { NewsItem } from "./types";

export function getMostFrequentLabel(newsItems: NewsItem[]) {
  // count the occurrences of each label in the formattedNews.newsItems and get the most frequent label
  const labelCounts = newsItems.reduce((acc, item) => {
    item.labels.forEach((label) => {
      acc[label.label] =
        (acc[label.label] || 0) +
        label.relationScore * NewsItemLabelWeights[label.label];
    });
    return acc;
  }, {} as Record<string, number>);
  const mostFrequentLabel = Object.keys(labelCounts).reduce((a, b) =>
    labelCounts[a] > labelCounts[b] ? a : b
  );
  return mostFrequentLabel;
}
