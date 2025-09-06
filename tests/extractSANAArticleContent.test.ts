import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const ARTICLE_SAMPLES_FOLDER = "article-samples";

// Mock the browser module
const mockGetBrowser = vi.fn();

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

// Create mock page object with default implementation
const mockPageFn = (html: string) => {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(async (fn: Function) => {
      // Create a mock DOM environment using jsdom
      const { JSDOM } = (await import("jsdom")) as any;
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Execute the function with the mock document as the global context
      // The function expects to run in the browser context where 'document' is global
      const originalDocument = global.document;
      global.document = document;

      try {
        return fn();
      } finally {
        global.document = originalDocument;
      }
    }),
    close: vi.fn(),
  };
};

const mockBrowserFn = (mockPage: any) => {
  return {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(),
  } as any;
};

describe("extractSANAArticleContent", () => {
  let mockPage: any;
  let mockBrowser: any;
  let extractSANAArticleContent: any;

  beforeEach(async () => {
    // Mock the browser module before importing
    vi.doMock("../src/browser", () => ({
      getBrowser: mockGetBrowser,
    }));

    // Dynamically import the module under test after mocking
    const module = await import("../src/extractSANAArticleContent");
    extractSANAArticleContent = module.extractSANAArticleContent;

    // Create fresh mocks for each test
    mockPage = mockPageFn("");
    mockBrowser = mockBrowserFn(mockPage);
    mockGetBrowser.mockResolvedValue(mockBrowser);
  });

  afterEach(() => {
    // Reset mock calls but keep implementations
    vi.clearAllMocks();
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  // Test error handling scenarios
  it("should handle browser errors gracefully", async () => {
    const mockUrl = "https://sana.sy/?p=2215080";

    // Mock browser to throw an error
    mockGetBrowser.mockRejectedValue(new Error("Browser error"));

    const result = await extractSANAArticleContent(mockUrl);
    expect(result).toBeUndefined();
  });

  it("should handle page navigation errors", async () => {
    const mockUrl = "https://sana.sy/?p=2215080";

    // Mock page.goto to throw an error
    mockPage.goto.mockRejectedValue(new Error("Navigation error"));

    const result = await extractSANAArticleContent(mockUrl);
    expect(result).toBeUndefined();
  });

  it("should handle page evaluation errors", async () => {
    const mockUrl = "https://sana.sy/?p=2215080";

    // Mock page.evaluate to throw an error
    mockPage.evaluate.mockRejectedValue(new Error("Evaluation error"));

    const result = await extractSANAArticleContent(mockUrl);
    expect(result).toBeUndefined();
  });

  it("should ensure browser is closed even if page operations fail", async () => {
    const mockUrl = "https://sana.sy/?p=2215080";

    // Mock page.goto to throw an error
    mockPage.goto.mockRejectedValue(new Error("Navigation error"));

    const result = await extractSANAArticleContent(mockUrl);
    expect(result).toBeUndefined();

    // Browser should still be closed even if page operations fail
    expect(mockBrowser.close).toHaveBeenCalledOnce();
  });

  // Test with sample data
  describe("with sample data", () => {
    articleSamples.forEach((sample) => {
      describe(`sample: ${sample.name}`, () => {
        beforeEach(async () => {
          // Create fresh mocks with sample HTML
          mockPage = mockPageFn(sample.html);
          mockBrowser = mockBrowserFn(mockPage);
          mockGetBrowser.mockResolvedValue(mockBrowser);
        });

        it("should extract article content successfully", async () => {
          const mockUrl = "https://sana.sy/?p=2215080";

          const result = await extractSANAArticleContent(mockUrl);

          expect(mockBrowser.newPage).toHaveBeenCalledOnce();
          expect(mockPage.goto).toHaveBeenCalledWith(mockUrl, {
            waitUntil: "domcontentloaded",
          });
          expect(mockPage.evaluate).toHaveBeenCalledOnce();
          expect(mockBrowser.close).toHaveBeenCalledOnce();

          // Verify the extracted content matches our expected results
          expect(result!.title).toBe(sample.expectedResult.title);
          expect(result!.body).toBe(sample.expectedResult.body.join("\n\n"));
        });

        it("should call page.evaluate with correct function", async () => {
          const mockUrl = "https://sana.sy/?p=2215080";

          const result = await extractSANAArticleContent(mockUrl);

          expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function));
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

      // Override the mock to return empty content
      mockPage.evaluate.mockImplementation(async (fn: Function) => {
        const { JSDOM } = (await import("jsdom")) as any;
        const dom = new JSDOM("<html><body></body></html>");
        const document = dom.window.document;

        const originalDocument = global.document;
        global.document = document;

        try {
          return fn();
        } finally {
          global.document = originalDocument;
        }
      });

      const result = await extractSANAArticleContent(mockUrl);

      expect(result).toEqual({ title: "", body: "" });
    });

    it("should handle missing title element", async () => {
      const mockUrl = "https://sana.sy/?p=2215080";

      // Override the mock to return HTML without title
      mockPage.evaluate.mockImplementation(async (fn: Function) => {
        const { JSDOM } = (await import("jsdom")) as any;
        const dom = new JSDOM(
          '<html><body><div class="entry-content rbct"><p>Test body</p></div></body></html>'
        );
        const document = dom.window.document;

        const originalDocument = global.document;
        global.document = document;

        try {
          return fn();
        } finally {
          global.document = originalDocument;
        }
      });

      const result = await extractSANAArticleContent(mockUrl);

      expect(result!.title).toBe("");
      expect(result!.body).toBe("Test body");
    });

    it("should handle missing paragraph elements", async () => {
      const mockUrl = "https://sana.sy/?p=2215080";

      // Override the mock to return HTML without paragraphs
      mockPage.evaluate.mockImplementation(async (fn: Function) => {
        const { JSDOM } = (await import("jsdom")) as any;
        const dom = new JSDOM(
          '<html><body><h1 class="s-title">Test Title</h1></body></html>'
        );
        const document = dom.window.document;

        const originalDocument = global.document;
        global.document = document;

        try {
          return fn();
        } finally {
          global.document = originalDocument;
        }
      });

      const result = await extractSANAArticleContent(mockUrl);

      expect(result!.title).toBe("Test Title");
      expect(result!.body).toBe("");
    });
  });
});
