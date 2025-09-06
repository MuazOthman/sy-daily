import { getBrowser } from "./browser";

export async function extractSANAArticleContent(url: string) {
  let browser = null;

  try {
    browser = await getBrowser();
    console.log("got browser");

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Extract the article title and body
    const result = await page.evaluate(() => {
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
    });

    return result;
  } catch (error) {
    console.error(`Failed to extract from ${url}:`, error);
  } finally {
    if (browser) await browser.close();
  }
}

// Example usage
// const urls = ["https://sana.sy/?p=2215080", "https://sana.sy/?p=2215109"];

// (async () => {
//   for (const url of urls) {
//     console.log("\n--- Extracting:", url);
//     await extractSANAArticleContent(url);
//   }
// })();
