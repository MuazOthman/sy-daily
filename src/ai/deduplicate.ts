import { generateObject, GenerateObjectResult } from "ai";
import {
  SimplifiedNewsItem,
  SimplifiedNewsResponse,
  SimplifiedNewsResponseSchema,
} from "../types";
import { getLLMProvider } from "./getLLMProvider";
import fs from "node:fs/promises";

const MAX_OUTPUT_TOKENS = 60000;
const BATCH_SIZE = 30;
const MAX_PARALLEL_REQUESTS = 5;
const BATCH_WAIT_TIME_MS = 2000; // 2 seconds
const ROUND_WAIT_TIME_MS = 4000; // 4 seconds
const DEDUPLICATION_RATIO_THRESHOLD = 0.95;
const MIN_ITEMS_PER_ROUND = 30;

async function writeToFile(
  items: SimplifiedNewsItem[],
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
      JSON.stringify(items, null, 2)
    );
  } else {
    console.log(
      `No output folder set, skipping write to file for ${type}-${batchName}.json`
    );
  }
}

const systemPromptDeduplicate = `You are a news editor fluent in Arabic. You'll be given a list of news items that may contain duplicates. Your task is to deduplicate the news items. Follow these rules:

1. Identify and merge ALL similar stories - whenever multiple items cover the same event or are related to the same topic, combine them into one news item.
2. Don't skip any news item: items that cannot be merged should be kept as is.
3. When merging, preserve all unique sources from the duplicate items.
4. Keep the most comprehensive summary when merging duplicates.
5. Return ALL unique news items after deduplication.`;

interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

async function deduplicateBatch(
  newsItems: SimplifiedNewsItem[],
  roundNumber: number,
  batchNumber: number
): Promise<{ items: SimplifiedNewsItem[]; usage: UsageStats }> {
  const model = getLLMProvider();
  await writeToFile(newsItems, "input", roundNumber, batchNumber);

  const result: GenerateObjectResult<SimplifiedNewsResponse> = await (
    generateObject as any
  )({
    model,
    system: systemPromptDeduplicate,
    prompt: JSON.stringify(newsItems, null, 2),
    schema: SimplifiedNewsResponseSchema,
    maxTokens: MAX_OUTPUT_TOKENS,
  });

  const batchName = `${String(roundNumber).padStart(2, "0")}-${String(
    batchNumber
  ).padStart(2, "0")}`;

  const { object: deduplicatedResponse, usage } = result;
  console.log(
    `  Batch: ${batchName} - ${newsItems.length} → ${
      deduplicatedResponse.items.length
    } items. Usage: ${JSON.stringify(usage)}`
  );
  await writeToFile(
    deduplicatedResponse.items,
    "output",
    roundNumber,
    batchNumber
  );

  return {
    items: deduplicatedResponse.items,
    usage: {
      promptTokens: usage.inputTokens || 0,
      completionTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens || 0,
    },
  };
}

async function processBatchesInParallel(
  batches: SimplifiedNewsItem[][],
  roundNumber: number
): Promise<{
  items: SimplifiedNewsItem[];
  requestCount: number;
  usage: UsageStats;
}> {
  const results: SimplifiedNewsItem[] = [];
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

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function deduplicateRound(
  newsItems: SimplifiedNewsItem[],
  roundNumber: number
): Promise<{
  items: SimplifiedNewsItem[];
  requestCount: number;
  usage: UsageStats;
}> {
  const startCount = newsItems.length;
  console.log(`\n🔄 Round ${roundNumber}: Processing ${startCount} items`);

  // Shuffle items before splitting into batches (except first round)
  const itemsToProcess = roundNumber > 1 ? shuffleArray(newsItems) : newsItems;
  if (roundNumber > 1) {
    console.log(`  Items shuffled for round ${roundNumber}`);
  }

  // Split into batches
  const batches: SimplifiedNewsItem[][] = [];
  for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE) {
    batches.push(itemsToProcess.slice(i, i + BATCH_SIZE));
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
  newsItems: SimplifiedNewsItem[]
): Promise<SimplifiedNewsItem[]> {
  if (newsItems.length === 0) {
    return newsItems;
  }

  try {
    console.log("🔍 Starting multi-round deduplication");
    const overallStart = Date.now();

    const startingItemCount = newsItems.length;
    const maxRounds = Math.floor(startingItemCount / MIN_ITEMS_PER_ROUND);
    console.log(
      `Starting items: ${startingItemCount}, Max rounds: ${maxRounds}`
    );

    let currentItems = newsItems;
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

    return currentItems;
  } catch (error) {
    console.error("Failed to deduplicate news items:", error);
    return newsItems;
  }
}
