import { ContentLanguage } from "../types";

export const KnownStrings = [
  "Source",
  "DailyBriefingForDay",
  "ProcessedThisManyPostsFromThisManySources",
  "ShowMoreItems",
  "Author",
  "TelegramFooter",
] as const;

export const Strings: Record<
  ContentLanguage,
  Record<(typeof KnownStrings)[number], string>
> = {
  arabic: {
    Source: "المصدر",
    DailyBriefingForDay: "الملخص اليومي لأخبار سورية لتاريخ",
    ProcessedThisManyPostsFromThisManySources:
      "بعد معالجة {numberOfPosts} منشوراً من {numberOfSources} مصدراً",
    ShowMoreItems: "عرض المزيد من الأخبار",
    Author: "فريق الملخص اليومي لأخبار سورية",
    TelegramFooter:
      "لمزيد من الأخبار وروابط المصادر يمكنكم زيارة الملخص على هذا الرابط: https://www.syria-daily.com/ar/posts/{date}",
  },
  english: {
    Source: "Source",
    DailyBriefingForDay: "Syria Daily News Briefing for",
    ProcessedThisManyPostsFromThisManySources:
      "Processed {numberOfPosts} posts from {numberOfSources} sources",
    ShowMoreItems: "Show more items",
    Author: "Syria Daily Briefing Team",
    TelegramFooter:
      "For more news and links to sources, you can visit the briefing at this link: https://www.syria-daily.com/posts/{date}",
  },
};
