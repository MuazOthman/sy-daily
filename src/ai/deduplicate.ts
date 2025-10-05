import {
  SimplifiedNewsItem,
  SimplifiedNewsResponse,
  SimplifiedNewsResponseSchema,
} from "../types";
import { callLLM } from "./getLLMProvider";
import fs from "node:fs/promises";

const MAX_OUTPUT_TOKENS = 32768; // this is the max tokens for the gpt-4.1 model.
const BATCH_SIZE = 150;
const MAX_PARALLEL_REQUESTS = 5;
const BATCH_WAIT_TIME_MS = 2000; // 2 seconds
const ROUND_WAIT_TIME_MS = 4000; // 4 seconds
const DEDUPLICATION_RATIO_THRESHOLD = 0.98;
const MIN_ITEMS_PER_ROUND = 30;
const SHOULD_SKIP_WRITE_TO_FILE = process.env.IS_LAMBDA === "true";

async function writeToFile(
  items: (SimplifiedNewsItem | string)[],
  type: "input" | "output",
  roundNumber: number,
  batchNumber?: number
) {
  if (SHOULD_SKIP_WRITE_TO_FILE) {
    return;
  }
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
  newsItems: (SimplifiedNewsItem | string)[],
  roundNumber: number,
  batchNumber: number
): Promise<{ items: SimplifiedNewsItem[]; usage: UsageStats }> {
  await writeToFile(newsItems, "input", roundNumber, batchNumber);

  const result = await callLLM<SimplifiedNewsResponse>({
    system: systemPromptDeduplicate,
    prompt: JSON.stringify(newsItems, null, 2),
    schema: SimplifiedNewsResponseSchema,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
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
  batches: (SimplifiedNewsItem | string)[][],
  roundNumber: number
): Promise<{
  batchResults: SimplifiedNewsItem[][];
  requestCount: number;
  usage: UsageStats;
}> {
  const batchResults: SimplifiedNewsItem[][] = [];
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

    const results = await Promise.all(
      batchGroup.map((batch, index) =>
        deduplicateBatch(batch, roundNumber, index + i + 1)
      )
    );

    results.forEach((result) => {
      batchResults.push(result.items);
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

  return { batchResults, requestCount, usage: totalUsage };
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
  previousBatchResults: SimplifiedNewsItem[][],
  roundNumber: number
): Promise<{
  batchResults: SimplifiedNewsItem[][];
  requestCount: number;
  usage: UsageStats;
}> {
  // Calculate total items from previous round batches
  const startCount = previousBatchResults.reduce(
    (sum, batch) => sum + batch.length,
    0
  );
  console.log(`\n🔄 Round ${roundNumber}: Processing ${startCount} items`);
  console.log(
    `  Redistributing from ${previousBatchResults.length} batches (round-robin)`
  );

  // Redistribute items using round-robin from previous batch results
  const batches: SimplifiedNewsItem[][] = [];
  let currentBatch: SimplifiedNewsItem[] = [];
  let sourceIndex = 0;

  while (previousBatchResults.some((batch) => batch.length > 0)) {
    // Find next non-empty batch in round-robin fashion
    let attempts = 0;
    while (
      attempts < previousBatchResults.length &&
      previousBatchResults[sourceIndex].length === 0
    ) {
      sourceIndex = (sourceIndex + 1) % previousBatchResults.length;
      attempts++;
    }

    // If all batches are empty, break
    if (attempts === previousBatchResults.length) {
      break;
    }

    // Take one item from current source batch
    const item = previousBatchResults[sourceIndex].shift();
    if (item) {
      currentBatch.push(item);
    }

    // Move to next source batch for next iteration
    sourceIndex = (sourceIndex + 1) % previousBatchResults.length;

    // If current batch is full, start a new one
    if (currentBatch.length === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = [];
    }
  }

  // Add any remaining items as the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(
    `  Redistributed into ${batches.length} batches of up to ${BATCH_SIZE} items`
  );

  // Flatten for file writing
  const allItems = batches.flat();
  await writeToFile(allItems, "input", roundNumber, undefined);

  // Process batches in parallel
  const { batchResults, requestCount, usage } = await processBatchesInParallel(
    batches,
    roundNumber
  );

  // Flatten for file writing
  const deduplicatedItems = batchResults.flat();
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

  return { batchResults, requestCount, usage };
}

export async function deduplicate(
  newsItems: string[]
): Promise<SimplifiedNewsItem[]> {
  if (newsItems.length === 0) {
    return [];
  }

  try {
    console.log("🔍 Starting multi-round deduplication");
    const overallStart = Date.now();

    const startingItemCount = newsItems.length;
    const maxRounds = Math.floor(startingItemCount / MIN_ITEMS_PER_ROUND);
    console.log(
      `Starting items: ${startingItemCount}, Max rounds: ${maxRounds}`
    );

    // Initial round: split items into batches normally (no round-robin yet)
    console.log(`\n🔄 Round 1: Processing ${startingItemCount} items`);
    const initialBatches: string[][] = [];
    for (let i = 0; i < newsItems.length; i += BATCH_SIZE) {
      initialBatches.push(newsItems.slice(i, i + BATCH_SIZE));
    }
    console.log(
      `  Split into ${initialBatches.length} batches of up to ${BATCH_SIZE} items`
    );

    await writeToFile(newsItems, "input", 1, undefined);

    const {
      batchResults: currentBatchResults,
      requestCount: firstRequestCount,
      usage: firstUsage,
    } = await processBatchesInParallel(initialBatches, 1);

    const firstRoundItems = currentBatchResults.flat();
    await writeToFile(firstRoundItems, "output", 1, undefined);

    console.log(
      `  Round 1 complete: ${startingItemCount} → ${
        firstRoundItems.length
      } items (ratio: ${(firstRoundItems.length / startingItemCount).toFixed(
        2
      )}, ${firstRequestCount} LLM requests)`
    );
    console.log(
      `  Round 1 usage: ${firstUsage.promptTokens.toLocaleString()} prompt + ${firstUsage.completionTokens.toLocaleString()} completion = ${firstUsage.totalTokens.toLocaleString()} total tokens`
    );

    let previousBatchResults = currentBatchResults;
    let totalRequests = firstRequestCount;
    const overallUsage: UsageStats = {
      promptTokens: firstUsage.promptTokens,
      completionTokens: firstUsage.completionTokens,
      totalTokens: firstUsage.totalTokens,
    };

    // Continue with subsequent rounds using round-robin redistribution
    let roundNumber = 2;
    while (roundNumber <= maxRounds) {
      const beforeCount = previousBatchResults.reduce(
        (sum, batch) => sum + batch.length,
        0
      );

      const { batchResults, requestCount, usage } = await deduplicateRound(
        previousBatchResults,
        roundNumber
      );
      previousBatchResults = batchResults;
      totalRequests += requestCount;
      overallUsage.promptTokens += usage.promptTokens;
      overallUsage.completionTokens += usage.completionTokens;
      overallUsage.totalTokens += usage.totalTokens;

      const afterCount = batchResults.reduce(
        (sum, batch) => sum + batch.length,
        0
      );
      const ratio = afterCount / beforeCount;

      // Check if we should continue
      if (ratio >= DEDUPLICATION_RATIO_THRESHOLD) {
        console.log(
          `\n✋ Stopping: ratio ${ratio.toFixed(
            2
          )} >= ${DEDUPLICATION_RATIO_THRESHOLD}`
        );
        break;
      }

      roundNumber++;

      // Wait between rounds if we're continuing
      if (roundNumber <= maxRounds && ratio < DEDUPLICATION_RATIO_THRESHOLD) {
        console.log(
          `\n⏳ Waiting ${ROUND_WAIT_TIME_MS / 1000}s before next round...`
        );
        await new Promise((resolve) => setTimeout(resolve, ROUND_WAIT_TIME_MS));
      }
    }

    const finalItems = previousBatchResults.flat();
    const overallEnd = Date.now();
    console.log(
      `\n✅ Deduplication completed in ${(
        (overallEnd - overallStart) /
        1000
      ).toFixed(1)}s`
    );
    console.log(
      `Final result: ${startingItemCount} → ${finalItems.length} items (${(
        (finalItems.length / startingItemCount) *
        100
      ).toFixed(1)}% remaining)`
    );
    console.log(`Total LLM requests made: ${totalRequests}`);
    console.log(
      `Overall usage: ${overallUsage.promptTokens.toLocaleString()} prompt + ${overallUsage.completionTokens.toLocaleString()} completion = ${overallUsage.totalTokens.toLocaleString()} total tokens`
    );

    return finalItems;
  } catch (error) {
    console.error("Failed to deduplicate news items:", error);
    return [];
  }
}
