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
    DailyBriefingForDay: "الملخص اليومي لتاريخ",
    ProcessedThisManyPostsFromThisManySources:
      "بعد معالجة {numberOfPosts} منشوراً من {numberOfSources} مصدراً",
  },
  english: {
    Source: "Source",
    DailyBriefingForDay: "Daily Briefing for",
    ProcessedThisManyPostsFromThisManySources:
      "Processed {numberOfPosts} posts from {numberOfSources} sources",
  },
};
