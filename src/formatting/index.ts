import {
  AvailableFormatter,
  CollectedNewsData,
  ContentLanguage,
  FormattedNewsData,
} from "../types";
import { telegramNewsFormatter } from "./telegramNewsFormatter";

export const Formatters: Record<
  AvailableFormatter,
  (
    newsData: CollectedNewsData & { language: ContentLanguage }
  ) => FormattedNewsData
> = {
  telegram: telegramNewsFormatter,
};
