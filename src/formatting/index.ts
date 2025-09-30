import {
  AvailableFormatter,
  ProcessedNews,
  ContentLanguage,
  FormattedNewsData,
} from "../types";
import { telegramNewsFormatter } from "./telegramNewsFormatter";

export const Formatters: Record<
  AvailableFormatter,
  (newsData: ProcessedNews & { language: ContentLanguage }) => FormattedNewsData
> = {
  telegram: telegramNewsFormatter,
};

export { Strings } from "./strings";
export { measureTelegramRenderedHtml } from "./measureTelegramRenderedHtml";
export { labelEmojis, getEmojiForNewsItem } from "./emojis";
