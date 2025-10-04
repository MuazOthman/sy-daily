// import { NewsItemLabelWeights } from "./prioritizeNews";
import { NewsItem, NewsItemLabel } from "./types";

export function getMostFrequentLabels(newsItems: NewsItem[]) {
  // count the occurrences of each label in the formattedNews.newsItems and get the most frequent label
  const labelCounts = newsItems.reduce((acc, item) => {
    item.labels.forEach((label) => {
      acc[label.label] = (acc[label.label] || 0) + label.relationScore;
    });
    return acc;
  }, {} as Record<NewsItemLabel, number>);
  const flattenedLabelCounts = Object.entries(labelCounts).map(
    ([label, count]) => ({
      label: label as NewsItemLabel,
      count,
    })
  );
  const sortedLabelCounts = flattenedLabelCounts.sort(
    (a, b) => b.count - a.count
  );
  const labelsSortedByFrequency = sortedLabelCounts.map((item) => item.label);
  return labelsSortedByFrequency;
}
