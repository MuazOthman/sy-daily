import { z } from "zod";

export type TelegramPost = {
  message: string;
  telegramId: number;
  channelUsername: string;
};

export type Channel = {
  handle: string;
  name: string;
};

export type ChannelConfig = {
  channels: Channel[];
};

export type ContentLanguage = "arabic" | "english";

export const NewItemLabels = [
  "aid",
  "business",
  "culture",
  "defense-incident",
  "economy",
  "education",
  "entertainment",
  "environment",
  "foreign-affairs",
  "health",
  "infrastructure",
  "politics",
  "president",
  "science",
  "security-incident",
  "services",
  "sports",
  "technology",
] as const;

export const NewsItemLabelSchema = z.enum(NewItemLabels);

export type NewsItemLabel = z.infer<typeof NewsItemLabelSchema>;

export const NewsItemLabelRelation = z.object({
  label: NewsItemLabelSchema,
  relationScore: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "The relation score of the news item to the label (whole number between 0 and 100)"
    ),
});

export type NewsItemLabelRelation = z.infer<typeof NewsItemLabelRelation>;

export const NewsItemSchema = z.object({
  summaryArabic: z.string().describe("The summary of the news item in Arabic"),
  summaryEnglish: z
    .string()
    .describe("The summary of the news item in English"),
  labels: z
    .array(NewsItemLabelRelation)
    .describe(
      "The labels of the news item. The sum of the relation scores should be exactly 100."
    ),
  sources: z
    .array(z.string())
    .min(1)
    .describe("The URLs of the sources of the news item"),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

export type NewsItemWithImportanceScore = NewsItem & {
  importanceScore: number;
};

export const NewsResponseSchema = z.object({
  newsItems: z.array(NewsItemSchema),
});

export type NewsResponse = z.infer<typeof NewsResponseSchema>;
