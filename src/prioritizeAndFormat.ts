import { prioritizeNews } from "./prioritizeNews";
import {
  AvailableFormatter,
  ProcessedNews,
  ContentLanguage,
  FormattedNewsData,
} from "./types";
import { Formatters } from "./formatting";

const MAX_NEWS_ITEMS = 10;

export function prioritizeAndFormat(
  newsData: ProcessedNews,
  language: ContentLanguage,
  formatter: AvailableFormatter
): FormattedNewsData | undefined {
  if (
    !newsData.newsResponse ||
    !newsData.newsResponse.newsItems ||
    newsData.newsResponse.newsItems.length === 0
  ) {
    return undefined;
  }

  console.log(`🔍 Found ${newsData.newsResponse.newsItems.length} news items`);
  const prioritizedNews = prioritizeNews(newsData.newsResponse.newsItems);

  // console.log(`🔍 Prioritized ${prioritizedNews.length} news items`);
  // console.log(JSON.stringify(prioritizedNews));

  const filteredNews = prioritizedNews.slice(0, MAX_NEWS_ITEMS);

  const formattedNews = Formatters[formatter]({
    language,
    newsResponse: { ...newsData.newsResponse, newsItems: filteredNews },
    date: newsData.date,
    numberOfPosts: newsData.numberOfPosts,
    numberOfSources: newsData.numberOfSources,
  });
  return formattedNews;
}
