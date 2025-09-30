import { generateObject } from "ai";
import { NewsResponse, NewsResponseSchema } from "../types";
import { CustomTerms } from "./customTerms";
import { withProviderFallback } from "./getLLMProvider";
import { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";

const MAX_OUTPUT_TOKENS = 20000;

const systemPromptSummarize = `You are a news editor fluent in English and Arabic. You'll be given Arabic news snippets from official sources posted in the last 24 hours.
Your task is to summarize each news item individually in isolation of the other news items. Follow these rules:

1. News will be given as a JSON array of strings.
2. Include ALL news items in the response, do not filter them out or limit the number of news items.
3. Do not combine news items, treat each news item as a separate entity.
4. Use neutral tone in summaries.
5. When editing the summary in Arabic, use verb-subject-object structure. DON'T USE subject-verb-object structure.
6. Use the following terms/idioms when translating: ${CustomTerms.map(
  (term) => `${term.arabic} -> ${term.english}`
).join(", ")}
7. The number of news items in the response should be exactly the number of news items in the input, do not add or remove any news items.`;

export async function summarize(
  news: string[],
  simulate = false
): Promise<NewsResponse> {
  if (news.length === 0) {
    return { newsItems: [] };
  }

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

  const BATCH_SIZE = 20;
  const MAX_PARALLEL_BATCHES = 30;
  const batches: string[][] = [];

  // Split news items into batches of 20
  for (let i = 0; i < news.length; i += BATCH_SIZE) {
    batches.push(news.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `🔍 Summarizing ${news.length} news items in ${batches.length} batch(es) of up to ${BATCH_SIZE} items each`
  );

  const allNewsItems: NewsResponse["newsItems"] = [];
  const overallStart = Date.now();
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  // Process batches in parallel, up to MAX_PARALLEL_BATCHES at a time
  const processBatch = async (batch: string[], batchIndex: number) => {
    const batchStart = Date.now();
    console.log(
      `📦 Processing batch ${batchIndex + 1}/${batches.length} (${
        batch.length
      } items)`
    );

    try {
      const inputText = JSON.stringify(batch, null, 2);

      // LLM call with fallback: Summarize, translate, and label
      const { result, providerUsed } = await withProviderFallback(
        async (model, config) => {
          return await (generateObject as any)({
            model,
            system: systemPromptSummarize,
            prompt: inputText,
            schema: NewsResponseSchema,
            maxTokens: MAX_OUTPUT_TOKENS,
            providerOptions: {
              openai: {
                store: true,
              } satisfies OpenAIResponsesProviderOptions,
            },
          });
        },
        `Summarize batch ${batchIndex + 1}`
      );

      const { object: batchResponse, usage } = result;

      // Accumulate usage statistics
      if (usage) {
        totalUsage.promptTokens += usage.promptTokens || 0;
        totalUsage.completionTokens += usage.completionTokens || 0;
        totalUsage.totalTokens += usage.totalTokens || 0;
      }

      const batchEnd = Date.now();
      console.log(
        `✅ Batch ${batchIndex + 1} completed in ${batchEnd - batchStart}ms (${
          batchResponse.newsItems.length
        } items) using ${providerUsed.provider}:${providerUsed.model}`
      );

      return batchResponse.newsItems;
    } catch (error) {
      console.error(`Failed to process batch ${batchIndex + 1}:`, error);
      return [];
    }
  };

  // Process in chunks of MAX_PARALLEL_BATCHES
  for (let i = 0; i < batches.length; i += MAX_PARALLEL_BATCHES) {
    const currentBatches = batches.slice(
      i,
      Math.min(i + MAX_PARALLEL_BATCHES, batches.length)
    );
    const startIndex = i;

    console.log(
      `🚀 Processing batches ${i + 1}-${Math.min(
        i + MAX_PARALLEL_BATCHES,
        batches.length
      )} in parallel`
    );

    // Process current chunk in parallel
    const batchPromises = currentBatches.map((batch, index) =>
      processBatch(batch, startIndex + index)
    );

    const batchResults = await Promise.all(batchPromises);

    // Combine results from this chunk
    for (const items of batchResults) {
      allNewsItems.push(...items);
    }
  }

  const overallEnd = Date.now();
  console.log(`📝 All batches completed in ${overallEnd - overallStart}ms`);
  console.log(`Total items generated: ${allNewsItems.length}`);
  console.log(`Total usage: ${JSON.stringify(totalUsage)}`);

  return { newsItems: allNewsItems };
}
