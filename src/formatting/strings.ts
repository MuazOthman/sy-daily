import { ContentLanguage } from "../types";

export const KnownStrings = [
  "Source",
  "DailyBriefingForDay",
  "ProcessedThisManyPostsFromThisManySources",
  "ShowMoreItems",
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
  },
  english: {
    Source: "Source",
    DailyBriefingForDay: "Syria Daily News Briefing for",
    ProcessedThisManyPostsFromThisManySources:
      "Processed {numberOfPosts} posts from {numberOfSources} sources",
    ShowMoreItems: "Show more items",
  },
};
