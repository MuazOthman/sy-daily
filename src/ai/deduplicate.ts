import { generateObject } from "ai";
import { NewsResponse, NewsResponseSchema } from "../types";
import { withProviderFallback } from "./getLLMProvider";
import { CustomTerms } from "./customTerms";

const MAX_OUTPUT_TOKENS = 60000;

const systemPromptDeduplicate = `You are a news editor fluent in English and Arabic. You'll be given a list of news items that may contain duplicates. Your task is to deduplicate the news items. Follow these rules:

1. Identify and merge ALL similar stories - whenever multiple items cover the same event, combine them into one news item.
2. When merging, preserve all unique sources from the duplicate items.
3. When merging, preserve all unique labels from the duplicate items and recalculate the relation scores.
4. Keep the most comprehensive summary when merging duplicates.
5. Produce both Arabic and English summaries after combining duplicates.
6. Use neutral tone in summaries.
7. When editing the summary in Arabic, use verb-subject-object structure. DON'T USE subject-verb-object structure.
8. Use the following terms/idioms when translating: ${CustomTerms.map(
  (term) => `${term.arabic} -> ${term.english}`
).join(", ")}
9. Return ALL unique news items after deduplication.`;

export async function deduplicate(
  newsResponse: NewsResponse
): Promise<NewsResponse> {
  if (newsResponse.newsItems.length === 0) {
    return newsResponse;
  }

  try {
    console.log("🔍 Deduplicating news items");
    const start = Date.now();

    // LLM call with fallback: Deduplicate
    const { result, providerUsed, attemptsMade } = await withProviderFallback(
      async (model, config) => {
        return await (generateObject as any)({
          model,
          system: systemPromptDeduplicate,
          prompt: JSON.stringify(newsResponse.newsItems, null, 2),
          schema: NewsResponseSchema,
          maxTokens: MAX_OUTPUT_TOKENS,
        });
      },
      "Deduplicate"
    );

    const { object: deduplicatedResponse, usage } = result;

    const end = Date.now();
    console.log(`✅ Deduplication completed in ${end - start}ms`);
    console.log(
      `Items before: ${newsResponse.newsItems.length}, after: ${deduplicatedResponse.newsItems.length}`
    );
    console.log(
      `Provider used: ${providerUsed.provider}:${providerUsed.model}. Usage: ${JSON.stringify(usage)}`
    );

    return deduplicatedResponse;
  } catch (error) {
    console.error("Failed to deduplicate news items:", error);
    return newsResponse;
  }
}
