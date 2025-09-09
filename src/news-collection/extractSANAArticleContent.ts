import { fetchAndParseHTML } from "./browser";

export async function extractSANAArticleContent(url: string) {
  console.log(`🔍 Extracting article from ${url.replace("https://", "")}`);

  try {
    const document = await fetchAndParseHTML(url);

    const title =
      document.querySelector("h1.s-title")?.textContent?.trim() || "";
    const paragraphs = Array.from(
      document.querySelectorAll(".entry-content.rbct p")
    );
    const body = paragraphs
      .map((p) => p.textContent?.trim().replace(/\s+/g, " ") || "")
      .filter((text) => text.length > 0)
      .join("\n\n");
    return { title, body };
  } catch (error) {
    console.error(
      `Failed to extract from ${url}, falling back to original content. Error:`,
      error
    );
    return undefined;
  }
}
