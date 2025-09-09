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

export const ContentLanguages = ["arabic", "english"] as const;

export type ContentLanguage = (typeof ContentLanguages)[number];

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

export type NewsItemLabel = (typeof NewItemLabels)[number];

export const NewsItemLabelSchema = z.enum(NewItemLabels);

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

export const CollectedNewsDataSchema = z.object({
  newsResponse: NewsResponseSchema,
  numberOfPosts: z.number(),
  numberOfSources: z.number(),
  date: z.string(),
});

export type CollectedNewsData = z.infer<typeof CollectedNewsDataSchema>;

export const AvailableFormatters = ["telegram"] as const;

export type AvailableFormatter = (typeof AvailableFormatters)[number];
