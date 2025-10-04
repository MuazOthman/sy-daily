import { extractSANAArticleContent } from "./extractSANAArticleContent";

export async function processTelegramPost(message: string): Promise<string> {
  const articleUrl = message.match(
    /(?:https?:\/\/(?:www\.)?)?sana\.sy\/.*(?:\n|$)/gi
  );
  if (articleUrl) {
    const normalizedUrl = articleUrl[0].startsWith("https://")
      ? articleUrl[0]
      : `https://${articleUrl[0]}`;
    console.log(`🔍 Extracting article from ${articleUrl[0]}`);
    const articleContent = await extractSANAArticleContent(normalizedUrl);
    if (articleContent) {
      return `${articleContent.title}\n\n${articleContent.body}\n\n${normalizedUrl}`;
    }
  }
  // remove text from and after ـــــــــــــــــــــ
  let result = message.replace(/ــ{2,}[\n.]*/gm, "");
  // remove hashtags
  result = result.replace(/#[^\s]+/g, "");
  // remove empty lines
  result = result.replace(/\n\s*\n/g, "\n");
  return result;
}
