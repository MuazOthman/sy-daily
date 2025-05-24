import { SANA_CHANNEL_USERNAME } from "./constants";
import { extractSANAArticleContent } from "./extractSANAArticleContent";

export async function processSANATelegramPost(
  message: string,
  telegramId: number
): Promise<string> {
  const articleUrl = message.match(/sana\.sy\/\?p=\d+/i);
  if (articleUrl) {
    console.log(`🔍 Extracting article from ${articleUrl[0]}`);
    const articleContent = await extractSANAArticleContent(
      `https://${articleUrl[0]}`
    );
    if (articleContent) {
      return `${articleContent.title}\n\n${articleContent.body}\n\nhttps://${articleUrl[0]}`;
    }
  }
  // remove text from and after ـــــــــــــــــــــ
  let result = message.replace(/ـــــــــــــــــــــ.*/g, "");
  // remove hashtags
  result = result.replace(/#[^\s]+/g, "");
  // remove empty lines
  result = result.replace(/\n\s*\n/g, "\n");
  return `${result}\n\nhttps://t.me/${SANA_CHANNEL_USERNAME}/${telegramId}`;
}
