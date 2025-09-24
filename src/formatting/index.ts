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
