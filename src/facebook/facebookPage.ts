import axios, { AxiosResponse } from "axios";
import { AbstractPublisher } from "../publishers/AbstractPublisher";
import {
  CollectedNewsData,
  ContentLanguage,
  FormattedNewsData,
  NewsItem,
  ProcessedNews,
} from "../types";
import { getEmojiForNewsItem, Strings } from "../formatting";

export interface FacebookPostOptions {
  caption?: string;
  altText?: string;
  published?: boolean;
}

interface FacebookErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
  };
}

interface FacebookPostResponse {
  id: string;
  post_id?: string;
}

export class FacebookPage extends AbstractPublisher {
  private accessToken: string;
  private baseUrl = "https://graph.facebook.com/v19.0";

  constructor() {
    super();
    // read access token from environment variable
    if (!process.env.FACEBOOK_ACCESS_TOKEN) {
      throw new Error("FACEBOOK_ACCESS_TOKEN is not set");
    }
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  }

  async setup(): Promise<void> {
    // No-op for Facebook since it uses stateless HTTP requests
    // No persistent connections to clean up
  }

  async postPhotoWithCaption(
    pageId: string,
    photoBuffer: Buffer,
    options: FacebookPostOptions = {}
  ): Promise<FacebookPostResponse> {
    const { caption = "", altText, published = true } = options;

    try {
      const formData = new FormData();

      // Create a blob from buffer for FormData - convert Buffer to Uint8Array
      const uint8Array = new Uint8Array(photoBuffer);
      const blob = new Blob([uint8Array], { type: "image/jpeg" });
      formData.append("source", blob, "photo.jpg");
      formData.append("caption", caption);
      formData.append("published", published.toString());
      formData.append("access_token", this.accessToken);

      if (altText) {
        formData.append("alt_text_custom", altText);
      }

      const response: AxiosResponse<
        FacebookPostResponse | FacebookErrorResponse
      > = await axios.post(`${this.baseUrl}/${pageId}/photos`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if ("error" in response.data) {
        throw new Error(`Facebook API Error: ${response.data.error.message}`);
      }

      console.log(
        `Successfully posted photo to Facebook Page ${pageId}:`,
        response.data.id
      );
      return response.data;
    } catch (error) {
      console.error("Error posting to Facebook Page:", error);
      throw error;
    }
  }

  async postTextOnly(
    pageId: string,
    message: string
  ): Promise<FacebookPostResponse> {
    try {
      const response: AxiosResponse<
        FacebookPostResponse | FacebookErrorResponse
      > = await axios.post(`${this.baseUrl}/${pageId}/feed`, {
        message: message,
        access_token: this.accessToken,
      });

      if ("error" in response.data) {
        throw new Error(`Facebook API Error: ${response.data.error.message}`);
      }

      console.log(
        `Successfully posted text to Facebook Page ${pageId}:`,
        response.data.id
      );
      return response.data;
    } catch (error) {
      console.error("Error posting text to Facebook Page:", error);
      throw error;
    }
  }

  static async validateAccessToken(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/me`, {
        params: {
          access_token: accessToken,
        },
      });

      return response.status === 200 && response.data.id;
    } catch (error) {
      console.error("Invalid Facebook access token:", error);
      return false;
    }
  }

  static async getPageInfo(pageId: string, accessToken: string): Promise<any> {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v19.0/${pageId}`,
        {
          params: {
            fields: "name,id,category",
            access_token: accessToken,
          },
        }
      );

      if (response.data.error) {
        throw new Error(`Facebook API Error: ${response.data.error.message}`);
      }

      return response.data;
    } catch (error) {
      console.error("Error getting Facebook page info:", error);
      throw error;
    }
  }

  // AbstractPublisher implementation
  async publishNews(
    channelId: string,
    banner: Buffer,
    text: string
  ): Promise<string> {
    // Note: channelId parameter is ignored since FacebookPage already has pageId in constructor
    // This allows for consistent interface while maintaining Facebook's constructor pattern
    const result = await this.postPhotoWithCaption(channelId, banner, {
      caption: text,
      published: true,
    });
    return result.id;
  }

  async destroy(): Promise<void> {
    // No-op for Facebook since it uses stateless HTTP requests
    // No persistent connections to clean up
  }

  formatNews(
    newsData: ProcessedNews,
    language: ContentLanguage
  ): FormattedNewsData {
    const { newsResponse, date, numberOfPosts, numberOfSources } = newsData;
    const newsItems = newsResponse.newsItems;

    if (newsItems.length === 0) {
      return {
        message: "",
        newsItems: [],
      };
    }

    const lang = Strings[language];
    const header = `${lang.DailyBriefingForDay} ${date}`;

    // Facebook posts have a larger character limit (63,206 characters) but shorter posts perform better
    // We'll format for better readability on Facebook
    const formattedItems = newsItems.map((item: NewsItem, index: number) => {
      const summary =
        language === "arabic" ? item.summaryArabic : item.summaryEnglish;
      const emoji = getEmojiForNewsItem(item);

      // Simple numbered format for Facebook
      return `${index + 1}. ${emoji} ${summary}`;
    });

    const footer = lang.ProcessedThisManyPostsFromThisManySources.replace(
      "{numberOfPosts}",
      numberOfPosts.toString()
    ).replace("{numberOfSources}", numberOfSources.toString());

    const message = [header, "", ...formattedItems, "", footer].join("\n");

    return {
      message,
      newsItems,
    };
  }
}
