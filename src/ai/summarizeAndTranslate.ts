import { generateObject } from "ai";
import { NewsResponse, NewsResponseSchema } from "../types";
import { CustomTerms } from "./customTerms";
import { getLLMProvider } from "./getLLMProvider";

const systemPrompt = `You are a news editor fluent in English and Arabic. You'll be given Arabic news snippets from official sources posted in the last 24 hours. Your task is to create a complete comprehensive list of news items but with duplicates removed. Follow these rules:

1. Deduplicate similar stories - if multiple posts cover the same event, combine them into one news item.
2. Include all deduplicated news items in the response, do not filter them out or limit the number of news items.
3. Events related to the president or foreign policy should have higher importance scores.
4. Use neutral tone in summaries.
5. When editing the summary in Arabic, use verb-subject-object structure. DON'T USE subject-verb-object structure.
6. Make sure to not include duplicate news items.
7. Use the following terms/idioms when translating: ${CustomTerms.map(
  (term) => `${term.arabic} -> ${term.english}`
).join(", ")}`;

export async function summarizeAndTranslate(
  news: string[],
  simulate = false
): Promise<NewsResponse> {
  if (news.length === 0) {
    return { newsItems: [] };
  }
  const inputText = news.join("\n=========================\n");
  if (simulate) {
    const mockResponse: NewsResponse = {
      newsItems: [
        {
          summaryArabic: "خبر تجريبي للاختبار",
          summaryEnglish: "Simulated news item for testing",
          labels: [{ label: "politics", relationScore: 100 }],
          sources: ["https://example.com"],
        },
      ],
    };
    // Validate the mock response with Zod
    return NewsResponseSchema.parse(mockResponse);
  }

  try {
    console.log("🔍 Summarizing and translating news items");
    const start = Date.now();
    const model = getLLMProvider();

    const result = await (generateObject as any)({
      model,
      system: systemPrompt,
      prompt: inputText,
      schema: NewsResponseSchema,
      maxTokens: 20000,
    });

    const { object: newsResponse, usage } = result;

    const end = Date.now();
    console.log(`🔍 Summarized and translated news items in ${end - start}ms`);
    console.log(
      `Model used: ${model.modelId}. Usage: ${JSON.stringify(usage)}`
    );

    return newsResponse;
  } catch (error) {
    console.error("Failed to get or validate LLM response:", error);
    return { newsItems: [] };
  }
}
