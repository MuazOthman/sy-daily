import { ContentLanguage } from "../types";

export const KnownStrings = [
  "Source",
  "DailyBriefingForDay",
  "ProcessedThisManyPostsFromThisManySources",
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
  },
  english: {
    Source: "Source",
    DailyBriefingForDay: "Syria Daily News Briefing for",
    ProcessedThisManyPostsFromThisManySources:
      "Processed {numberOfPosts} posts from {numberOfSources} sources",
  },
};
