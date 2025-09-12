import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const ARTICLE_SAMPLES_FOLDER = "article-samples";

// Mock the browser module
const mockFetchAndParseHTML = vi.fn();

type ArticleSample = {
  name: string;
  html: string;
  expectedResult: {
    title: string;
    body: string[];
  };
};

// Load test data from external files
const loadTestData = () => {
  // get all files in the article samples folder
  const files = readdirSync(join(__dirname, ARTICLE_SAMPLES_FOLDER));
  // verify that for every html file, there is a corresponding result.json file
  const articleSamples: ArticleSample[] = files
    .map((file) => {
      if (file.endsWith(".html")) {
        const name = file.replace(".html", "");
        const htmlPath = join(__dirname, ARTICLE_SAMPLES_FOLDER, file);
        const resultPath = join(
          __dirname,
          ARTICLE_SAMPLES_FOLDER,
          `${name}-result.json`
        );
        if (!existsSync(resultPath)) {
          throw new Error(`Result file for ${file} not found`);
        }
        const htmlContent = readFileSync(htmlPath, "utf-8");
        const expectedResult = JSON.parse(
          readFileSync(resultPath, "utf-8")
        ) as ArticleSample["expectedResult"];
        return { name, html: htmlContent, expectedResult };
      }
    })
    .filter((sample) => sample !== undefined);
  return articleSamples;
};

const articleSamples = loadTestData();

// Create mock document function
const mockDocumentFromHTML = (html: string): Document => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(html);
  return dom.window.document;
};

describe("extractSANAArticleContent", () => {
  let extractSANAArticleContent: any;

  beforeEach(async () => {
    // Mock the browser module before importing
    vi.doMock("../src/browser", () => ({
      fetchAndParseHTML: mockFetchAndParseHTML,
    }));

    // Dynamically import the module under test after mocking
    const module = await import(
      "../src/news-collection/extractSANAArticleContent"
    );
    extractSANAArticleContent = module.extractSANAArticleContent;
  });

  afterEach(() => {
    // Reset mock calls but keep implementations
    vi.clearAllMocks();
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  // Test error handling scenarios
  it("should handle fetch errors gracefully", async () => {
    const mockUrl = "https://sana.sy/?p=2215080";

    // Mock fetchAndParseHTML to throw an error
    mockFetchAndParseHTML.mockRejectedValue(new Error("Fetch error"));

    const result = await extractSANAArticleContent(mockUrl);
    expect(result).toBeUndefined();
  });

  // Test with sample data
  describe("with sample data", () => {
    articleSamples.forEach((sample) => {
      describe(`sample: ${sample.name}`, () => {
        beforeEach(async () => {
          // Mock fetchAndParseHTML to return the sample HTML as a Document
          mockFetchAndParseHTML.mockResolvedValue(
            mockDocumentFromHTML(sample.html)
          );
        });

        it("should extract article content successfully", async () => {
          const mockUrl = "https://sana.sy/?p=2215080";

          const result = await extractSANAArticleContent(mockUrl);

          expect(mockFetchAndParseHTML).toHaveBeenCalledWith(mockUrl);

          // Verify the extracted content matches our expected results
          expect(result!.title).toBe(sample.expectedResult.title);
          expect(result!.body).toBe(sample.expectedResult.body.join("\n\n"));
        });

        it("should call fetchAndParseHTML with correct URL", async () => {
          const mockUrl = "https://sana.sy/?p=2215080";

          const result = await extractSANAArticleContent(mockUrl);

          expect(mockFetchAndParseHTML).toHaveBeenCalledWith(mockUrl);
          expect(result!.title).toBe(sample.expectedResult.title);
          expect(result!.body).toBe(sample.expectedResult.body.join("\n\n"));
        });
      });
    });
  });

  // Test edge cases
  describe("edge cases", () => {
    it("should handle empty title and body", async () => {
      const mockUrl = "https://sana.sy/?p=2215080";

      mockFetchAndParseHTML.mockResolvedValue(
        mockDocumentFromHTML("<html><body></body></html>")
      );

      const result = await extractSANAArticleContent(mockUrl);

      expect(result).toEqual({ title: "", body: "" });
    });

    it("should handle missing title element", async () => {
      const mockUrl = "https://sana.sy/?p=2215080";

      mockFetchAndParseHTML.mockResolvedValue(
        mockDocumentFromHTML(
          '<html><body><div class="entry-content rbct"><p>Test body</p></div></body></html>'
        )
      );

      const result = await extractSANAArticleContent(mockUrl);

      expect(result!.title).toBe("");
      expect(result!.body).toBe("Test body");
    });

    it("should handle missing paragraph elements", async () => {
      const mockUrl = "https://sana.sy/?p=2215080";

      mockFetchAndParseHTML.mockResolvedValue(
        mockDocumentFromHTML(
          '<html><body><h1 class="s-title">Test Title</h1></body></html>'
        )
      );

      const result = await extractSANAArticleContent(mockUrl);

      expect(result!.title).toBe("Test Title");
      expect(result!.body).toBe("");
    });
  });
});
