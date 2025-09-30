import { ContentLanguage, FormattedNewsData, ProcessedNews } from "../types";

export abstract class AbstractPublisher {
  /**
   * Setup method called before taking any action
   * - For Telegram: Logs in the client
   * - For Facebook: No-op (stateless HTTP requests)
   * @returns Promise<void>
   */
  abstract setup(): Promise<void>;
  /**
   * Publishes news content with a banner image to the specified channel
   * @param channelId - The channel/page ID to publish to
   * @param banner - The banner image as a Buffer
   * @param text - The formatted news text content
   * @returns Promise<string> - The ID of the created post
   */
  abstract publishNews(
    channelId: string,
    banner: Buffer,
    text: string
  ): Promise<string>;

  /**
   * Cleanup method called after publishing
   * - For Telegram: Disconnects the client
   * - For Facebook: No-op (stateless HTTP requests)
   * @returns Promise<void>
   */
  abstract destroy(): Promise<void>;

  /**
   * Formats the news data for the publisher
   * @param newsData - The news data to format
   * @param language - The language of the news data
   * @returns Formatted news data
   */
  abstract formatNews(
    newsData: ProcessedNews,
    language: ContentLanguage
  ): FormattedNewsData;
}
