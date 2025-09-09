import {
  AvailableFormatter,
  CollectedNewsData,
  ContentLanguage,
} from "../types";
import { telegramNewsFormatter } from "./telegramNewsFormatter";

export const Formatters: Record<
  AvailableFormatter,
  (newsData: CollectedNewsData & { language: ContentLanguage }) => string
> = {
  telegram: telegramNewsFormatter,
};
