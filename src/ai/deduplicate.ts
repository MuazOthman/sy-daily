import { generateObject } from "ai";
import { NewsResponse, NewsResponseSchema, NewsItem } from "../types";
import { getLLMProvider } from "./getLLMProvider";
import { CustomTerms } from "./customTerms";
import fs from "node:fs/promises";

const MAX_OUTPUT_TOKENS = 60000;
const BATCH_SIZE = 50;
const MAX_PARALLEL_REQUESTS = 5;
const BATCH_WAIT_TIME_MS = 2000; // 2 seconds
const ROUND_WAIT_TIME_MS = 4000; // 4 seconds
const DEDUPLICATION_RATIO_THRESHOLD = 0.9;
const MIN_ITEMS_PER_ROUND = 30;

async function writeToFile(
  newsItems: NewsItem[],
  type: "input" | "output",
  roundNumber: number,
  batchNumber?: number
) {
  const DEDUPE_OUTPUT_FOLDER = process.env.DEDUPE_OUTPUT_FOLDER;
  const batchName = `${String(roundNumber).padStart(2, "0")}-${
    batchNumber ? String(batchNumber).padStart(2, "0") : "--"
  }`;
  if (DEDUPE_OUTPUT_FOLDER) {
    await fs.writeFile(
      `${DEDUPE_OUTPUT_FOLDER}/${batchName}-${type}.json`,
      JSON.stringify(newsItems, null, 2)
    );
  } else {
    console.log(
      `No output folder set, skipping write to file for ${type}-${batchName}.json`
    );
  }
}

const systemPromptDeduplicate = `You are a news editor fluent in English and Arabic. You'll be given a list of news items that may contain duplicates. Your task is to deduplicate the news items. Follow these rules:

1. Identify and merge ALL similar stories - whenever multiple items cover the same event, combine them into one news item.
2. Don't skip any news item: items that cannot be merged should be kept as is.
3. When merging, preserve all unique sources from the duplicate items.
4. When merging, preserve all unique labels from the duplicate items and recalculate the relation scores.
5. Keep the most comprehensive summary when merging duplicates.
6. Produce both Arabic and English summaries after combining duplicates.
7. Use neutral tone in summaries.
8. When editing the summary in Arabic, use verb-subject-object structure. DON'T USE subject-verb-object structure.
9. Use the following terms/idioms when translating: ${CustomTerms.map(
  (term) => `${term.arabic} -> ${term.english}`
).join(", ")}
9. Return ALL unique news items after deduplication.`;

interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

async function deduplicateBatch(
  newsItems: NewsItem[],
  roundNumber: number,
  batchNumber: number
): Promise<{ items: NewsItem[]; usage: UsageStats }> {
  const model = getLLMProvider();
  await writeToFile(newsItems, "input", roundNumber, batchNumber);

  const result = await (generateObject as any)({
    model,
    system: systemPromptDeduplicate,
    prompt: JSON.stringify(newsItems, null, 2),
    schema: NewsResponseSchema,
    maxTokens: MAX_OUTPUT_TOKENS,
  });

  const batchName = `${String(roundNumber).padStart(2, "0")}-${String(
    batchNumber
  ).padStart(2, "0")}`;

  const { object: deduplicatedResponse, usage } = result;
  console.log(
    `  Batch: ${batchName} - ${newsItems.length} → ${
      deduplicatedResponse.newsItems.length
    } items. Usage: ${JSON.stringify(usage)}`
  );
  await writeToFile(
    deduplicatedResponse.newsItems,
    "output",
    roundNumber,
    batchNumber
  );

  return {
    items: deduplicatedResponse.newsItems,
    usage: {
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
    },
  };
}

async function processBatchesInParallel(
  batches: NewsItem[][],
  roundNumber: number
): Promise<{ items: NewsItem[]; requestCount: number; usage: UsageStats }> {
  const results: NewsItem[] = [];
  let requestCount = 0;
  const totalUsage: UsageStats = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  for (let i = 0; i < batches.length; i += MAX_PARALLEL_REQUESTS) {
    const batchGroup = batches.slice(i, i + MAX_PARALLEL_REQUESTS);
    console.log(
      `  Processing batches ${i + 1}-${i + batchGroup.length} of ${
        batches.length
      }`
    );

    const batchResults = await Promise.all(
      batchGroup.map((batch, index) =>
        deduplicateBatch(batch, roundNumber, index + i + 1)
      )
    );

    batchResults.forEach((result) => {
      results.push(...result.items);
      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
    });
    requestCount += batchGroup.length;

    // Wait between batch groups if there are more batches
    if (i + MAX_PARALLEL_REQUESTS < batches.length) {
      console.log(
        `  Waiting ${BATCH_WAIT_TIME_MS / 1000}s before next batch group...`
      );
      await new Promise((resolve) => setTimeout(resolve, BATCH_WAIT_TIME_MS));
    }
  }

  return { items: results, requestCount, usage: totalUsage };
}

async function deduplicateRound(
  newsItems: NewsItem[],
  roundNumber: number
): Promise<{ items: NewsItem[]; requestCount: number; usage: UsageStats }> {
  const startCount = newsItems.length;
  console.log(`\n🔄 Round ${roundNumber}: Processing ${startCount} items`);

  // Split into batches
  const batches: NewsItem[][] = [];
  for (let i = 0; i < newsItems.length; i += BATCH_SIZE) {
    batches.push(newsItems.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `  Split into ${batches.length} batches of up to ${BATCH_SIZE} items`
  );

  await writeToFile(newsItems, "input", roundNumber, undefined);

  // Process batches in parallel
  const {
    items: deduplicatedItems,
    requestCount,
    usage,
  } = await processBatchesInParallel(batches, roundNumber);

  await writeToFile(deduplicatedItems, "output", roundNumber, undefined);

  const endCount = deduplicatedItems.length;
  const ratio = endCount / startCount;

  console.log(
    `  Round ${roundNumber} complete: ${startCount} → ${endCount} items (ratio: ${ratio.toFixed(
      2
    )}, ${requestCount} LLM requests)`
  );
  console.log(
    `  Round ${roundNumber} usage: ${usage.promptTokens.toLocaleString()} prompt + ${usage.completionTokens.toLocaleString()} completion = ${usage.totalTokens.toLocaleString()} total tokens`
  );

  return { items: deduplicatedItems, requestCount, usage };
}

export async function deduplicate(
  newsResponse: NewsResponse
): Promise<NewsResponse> {
  if (newsResponse.newsItems.length === 0) {
    return newsResponse;
  }

  try {
    console.log("🔍 Starting multi-round deduplication");
    const overallStart = Date.now();

    const startingItemCount = newsResponse.newsItems.length;
    const maxRounds = Math.floor(startingItemCount / MIN_ITEMS_PER_ROUND);
    console.log(
      `Starting items: ${startingItemCount}, Max rounds: ${maxRounds}`
    );

    let currentItems = newsResponse.newsItems;
    let roundNumber = 1;
    let totalRequests = 0;
    const overallUsage: UsageStats = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    while (roundNumber <= maxRounds) {
      const beforeCount = currentItems.length;

      const { items, requestCount, usage } = await deduplicateRound(
        currentItems,
        roundNumber
      );
      currentItems = items;
      totalRequests += requestCount;
      overallUsage.promptTokens += usage.promptTokens;
      overallUsage.completionTokens += usage.completionTokens;
      overallUsage.totalTokens += usage.totalTokens;

      const afterCount = currentItems.length;
      const ratio = afterCount / beforeCount;

      // Check if we should continue
      if (ratio > DEDUPLICATION_RATIO_THRESHOLD) {
        console.log(
          `\n✋ Stopping: ratio ${ratio.toFixed(
            2
          )} > ${DEDUPLICATION_RATIO_THRESHOLD}`
        );
        break;
      }

      roundNumber++;

      // Wait between rounds if we're continuing
      if (roundNumber <= maxRounds && ratio <= DEDUPLICATION_RATIO_THRESHOLD) {
        console.log(
          `\n⏳ Waiting ${ROUND_WAIT_TIME_MS / 1000}s before next round...`
        );
        await new Promise((resolve) => setTimeout(resolve, ROUND_WAIT_TIME_MS));
      }
    }

    const overallEnd = Date.now();
    console.log(
      `\n✅ Deduplication completed in ${(
        (overallEnd - overallStart) /
        1000
      ).toFixed(1)}s`
    );
    console.log(
      `Final result: ${startingItemCount} → ${currentItems.length} items (${(
        (currentItems.length / startingItemCount) *
        100
      ).toFixed(1)}% remaining)`
    );
    console.log(`Total LLM requests made: ${totalRequests}`);
    console.log(
      `Overall usage: ${overallUsage.promptTokens.toLocaleString()} prompt + ${overallUsage.completionTokens.toLocaleString()} completion = ${overallUsage.totalTokens.toLocaleString()} total tokens`
    );

    return { newsItems: currentItems };
  } catch (error) {
    console.error("Failed to deduplicate news items:", error);
    return newsResponse;
  }
}
