import axios from "axios";
import { JSDOM } from "jsdom";
import { loadChannelConfig } from "./getPostsInLast24Hours";

export interface TelegramPost {
  id: number;
  text: string;
  permalink: string;
  date: string;
}

export interface FetchChannelPostsResult {
  posts: TelegramPost[];
  status: number;
  retryAfter?: number;
}

export interface FetchOptions {
  /** Telegram channel username without @, e.g. "AlekhbariahSY" */
  channel: string;
  /**
   * Optional pagination: fetch older posts before a given message id.
   * Telegram supports: https://t.me/s/<channel>?before=<id>
   */
  beforeId?: number;
  /** Request timeout in ms (default 10s) */
  timeoutMs?: number;
  /** Extra headers if you need to customize (e.g., proxy setups) */
  headers?: Record<string, string>;
}

/** Extract numeric id from a permalink like https://t.me/<channel>/<id>?single */
function extractIdFromPermalink(href: string): number | null {
  const m = href.match(/\/(\d+)(?:\?|$)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

/** Normalize inner text (preserve line breaks reasonably) */
function normalizeText(el: HTMLElement): string {
  // Replace <br> tags with newlines before extracting text
  el.querySelectorAll("br").forEach((br) => (br.outerHTML = "\n"));
  const text = el.textContent ?? "";
  // Replace non-breaking spaces with regular spaces
  return text.replace(/\u00A0/g, " ").trim();
}

/** Parse the HTML of a /s page into TelegramPost[] */
function parsePostsFromHtml(html: string): TelegramPost[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const wraps = Array.from(
    doc.querySelectorAll<HTMLElement>(".tgme_widget_message_wrap")
  );

  const posts: TelegramPost[] = [];
  for (const wrap of wraps) {
    // Extract permalink & post ID from message date link
    const dateLink = wrap.querySelector<HTMLAnchorElement>(
      "a.tgme_widget_message_date"
    );
    if (!dateLink?.href) continue;

    const permalink = dateLink.href;
    const id = extractIdFromPermalink(permalink);
    if (id === null) continue;

    // Extract ISO date from time element's datetime attribute
    const timeEl = dateLink.querySelector<HTMLTimeElement>("time[datetime]");
    const dateTimeAttr = timeEl?.getAttribute("datetime");
    const date = dateTimeAttr || new Date().toISOString();

    // Extract text body and caption (photos have captions, text posts have body)
    const textEl = wrap.querySelector<HTMLElement>(".tgme_widget_message_text");
    const captionEl = wrap.querySelector<HTMLElement>(
      ".tgme_widget_message_caption"
    );
    const body = textEl ? normalizeText(textEl) : "";
    const caption = captionEl ? normalizeText(captionEl) : "";

    const text = [body, caption].filter(Boolean).join("\n\n");

    posts.push({ id, text, permalink, date });
  }

  // Keep chronological order by id (ascending)
  posts.sort((a, b) => a.id - b.id);
  return posts;
}

/**
 * Fetches and parses posts from a public Telegram channel's web "S" page.
 * Example: await fetchChannelPosts({ channel: "AlekhbariahSY" })
 */
export async function fetchChannelPosts(
  opts: FetchOptions
): Promise<FetchChannelPostsResult> {
  const { channel, beforeId, timeoutMs = 10_000, headers = {} } = opts;

  const baseUrl = `https://t.me/s/${channel}`;
  const url = beforeId ? `${baseUrl}?before=${beforeId}` : baseUrl;

  console.log(`Fetching ${url}`);

  const resp = await axios.get<string>(url, {
    timeout: timeoutMs,
    headers: {
      // Helpful headers to avoid overly aggressive anti-bot heuristics
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      ...headers,
    },
    // Telegram serves static HTML for /s pages
    responseType: "text",
    validateStatus: () => true,
  });

  const posts = resp.status === 200 ? parsePostsFromHtml(resp.data) : [];
  const retryAfter = resp.headers["retry-after"]
    ? parseInt(resp.headers["retry-after"], 10)
    : undefined;

  return { posts, status: resp.status, retryAfter };
}

/**
 * Polynomial backoff with jitter for rate limiting (between linear and exponential)
 * Uses power of 1.5 for growth between linear (1.0) and exponential (2.0)
 * @param requestCount - The current request number (1-indexed)
 * @param baseDelay - Base delay in milliseconds (default 50ms)
 * @param maxDelay - Maximum delay in milliseconds (default 5000ms)
 * @param retryAfter - Optional retry-after value from server (in seconds)
 */
async function exponentialBackoffWithJitter(
  requestCount: number,
  baseDelay: number = 50,
  maxDelay: number = 5000,
  retryAfter?: number
): Promise<void> {
  if (requestCount <= 1 && !retryAfter) return;

  let delay: number;

  if (retryAfter) {
    // Honor server's retry-after header (convert seconds to milliseconds)
    delay = retryAfter * 1000;
    console.log(`Server requested retry-after ${retryAfter}s (${delay}ms)...`);
  } else {
    // Polynomial backoff: power of 1.5 for smoother growth than exponential
    const polynomialDelay = baseDelay * Math.pow(requestCount - 1, 1.5);
    const jitter = Math.random() * polynomialDelay * 0.3; // Add 0-30% jitter
    delay = Math.min(polynomialDelay + jitter, maxDelay); // Cap at maxDelay
    console.log(`Waiting ${Math.round(delay)}ms before next request...`);
  }

  await new Promise((resolve) => setTimeout(resolve, delay));
}

const MAX_NO_POSTS = 500;
const MAX_REQUESTS = 25;

async function fetchChannel(channel: string, startTime: Date, endTime: Date) {
  const startWatch = new Date();
  const startMemory = process.memoryUsage();

  console.log(
    `Fetching posts between ${startTime.toISOString()} and ${endTime.toISOString()}`
  );

  let fetchedPosts = [];
  let postsInRange = [];
  let beforeId: number | undefined = undefined;
  let shouldContinue = true;
  let requestCount = 0;
  let lastRetryAfter: number | undefined = undefined;

  // Track peak memory usage
  let peakMemory: NodeJS.MemoryUsage = {
    rss: startMemory.rss,
    heapTotal: startMemory.heapTotal,
    heapUsed: startMemory.heapUsed,
    external: startMemory.external,
    arrayBuffers: startMemory.arrayBuffers,
  };
  let rateLimitBreaks = 0;
  let consecutiveFailures = 0;

  while (
    shouldContinue &&
    postsInRange.length < MAX_NO_POSTS &&
    requestCount < MAX_REQUESTS
  ) {
    requestCount++;

    const result = await fetchChannelPosts({
      channel,
      beforeId,
    });
    const { posts, status, retryAfter } = result;

    lastRetryAfter = retryAfter;

    // Handle rate limiting with aggressive backoff
    if (status === 429) {
      rateLimitBreaks++;
      console.log(`Rate limit break #${rateLimitBreaks}`);
      await exponentialBackoffWithJitter(
        rateLimitBreaks,
        200,
        5000,
        lastRetryAfter
      );
      continue; // Retry the same request
    }

    // Handle non-200 responses with retry logic
    if (status !== 200) {
      consecutiveFailures++;
      console.log(
        `HTTP ${status} received (${consecutiveFailures}/3 consecutive failures)`
      );

      if (consecutiveFailures >= 3) {
        console.log(
          `Too many consecutive failures (${consecutiveFailures}), stopping`
        );
        break;
      }

      // Backoff before retry
      await exponentialBackoffWithJitter(
        consecutiveFailures,
        100,
        3000,
        lastRetryAfter
      );
      continue; // Retry the same request
    }

    // Reset failure counter on success
    consecutiveFailures = 0;

    // Normal backoff between successful requests
    await exponentialBackoffWithJitter(requestCount, 10, 2000, lastRetryAfter);

    if (posts.length === 0) {
      console.log("No posts found, breaking");
      break;
    }
    fetchedPosts.push(...posts);

    // Filter posts that fall within the requested time range
    const postsInRangeInThisRequest = posts.filter((p) => {
      const postDate = new Date(p.date);
      return postDate >= startTime && postDate <= endTime;
    });
    postsInRange.push(...postsInRangeInThisRequest);

    // Stop if we've paginated past the start time (posts are sorted ascending)
    const oldestPost = posts[0];
    if (oldestPost && new Date(oldestPost.date) < startTime) {
      console.log(`Reached posts older than start time, stopping`);
      shouldContinue = false;
    }

    console.log(
      `Fetched ${posts.length} posts, ${
        postsInRangeInThisRequest.length
      } in range. IDs: [${posts.map((p) => p.id)}]. Used beforeId ${beforeId}`
    );

    // Track peak memory usage across requests
    const currentMemory = process.memoryUsage();
    peakMemory.rss = Math.max(peakMemory.rss, currentMemory.rss);
    peakMemory.heapTotal = Math.max(
      peakMemory.heapTotal,
      currentMemory.heapTotal
    );
    peakMemory.heapUsed = Math.max(peakMemory.heapUsed, currentMemory.heapUsed);
    peakMemory.external = Math.max(peakMemory.external, currentMemory.external);
    peakMemory.arrayBuffers = Math.max(
      peakMemory.arrayBuffers,
      currentMemory.arrayBuffers
    );

    // Use smallest post ID for next pagination request
    beforeId = posts.map((p) => p.id).sort((a, b) => a - b)[0];
  }

  // Sort results newest first (descending)
  postsInRange.sort((a, b) => b.id - a.id);
  fetchedPosts.sort((a, b) => b.id - a.id);

  console.log(
    `Fetched a total of ${fetchedPosts.length}, ${postsInRange.length} in time range`
  );

  const endWatch = new Date();

  console.log(`Time taken: ${new Date().getTime() - startWatch.getTime()}ms`);
  return {
    fetchedPosts,
    postsInRange,
    requestCount,
    timeTaken: endWatch.getTime() - startWatch.getTime(),
    rateLimitBreaks,
    peakMemory,
  };
}

export async function getPostsForAllChannels(
  channels: string[],
  startTime: Date,
  endTime: Date
) {
  const startMemory = process.memoryUsage();

  const results: Record<
    string,
    {
      fetchedPosts: TelegramPost[];
      postsInRange: TelegramPost[];
      requestCount: number;
      timeTaken: number;
      rateLimitBreaks: number;
      peakMemory: NodeJS.MemoryUsage;
    }
  > = {};

  // Track global peak memory across all channels
  let globalPeakMemory: NodeJS.MemoryUsage = {
    rss: startMemory.rss,
    heapTotal: startMemory.heapTotal,
    heapUsed: startMemory.heapUsed,
    external: startMemory.external,
    arrayBuffers: startMemory.arrayBuffers,
  };

  let i = 0;

  for (const channel of channels) {
    i++;
    const channelHandle = channel.replace("@", "");
    const fetchChannelResult = await fetchChannel(
      channelHandle,
      startTime,
      endTime
    );
    results[channelHandle] = fetchChannelResult;

    // Track global peak memory across all channels
    globalPeakMemory.rss = Math.max(
      globalPeakMemory.rss,
      fetchChannelResult.peakMemory.rss
    );
    globalPeakMemory.heapTotal = Math.max(
      globalPeakMemory.heapTotal,
      fetchChannelResult.peakMemory.heapTotal
    );
    globalPeakMemory.heapUsed = Math.max(
      globalPeakMemory.heapUsed,
      fetchChannelResult.peakMemory.heapUsed
    );
    globalPeakMemory.external = Math.max(
      globalPeakMemory.external,
      fetchChannelResult.peakMemory.external
    );
    globalPeakMemory.arrayBuffers = Math.max(
      globalPeakMemory.arrayBuffers,
      fetchChannelResult.peakMemory.arrayBuffers
    );

    // Delay between channels to avoid overwhelming servers
    await exponentialBackoffWithJitter(i, 30, 2000);
  }

  // Summarize results by channel for logging
  const resultsByChannel = Object.fromEntries(
    Object.entries(results).map(([channelHandle, stats]) => [
      channelHandle,
      {
        fetchedPosts: stats.fetchedPosts.length,
        postsInRange: stats.postsInRange.length,
        requestCount: stats.requestCount,
        timeTaken: stats.timeTaken,
        rateLimitBreaks: stats.rateLimitBreaks,
      },
    ])
  );

  console.log(JSON.stringify(resultsByChannel, null, 2));

  console.log(
    `Total posts fetched: ${Object.values(results).reduce(
      (acc, curr) => acc + curr.fetchedPosts.length,
      0
    )}`
  );
  console.log(
    `Total posts in range: ${Object.values(results).reduce(
      (acc, curr) => acc + curr.postsInRange.length,
      0
    )}`
  );
  console.log(
    `Total requests: ${Object.values(results).reduce(
      (acc, curr) => acc + curr.requestCount,
      0
    )}`
  );
  console.log(
    `Total rate limit breaks: ${Object.values(results).reduce(
      (acc, curr) => acc + curr.rateLimitBreaks,
      0
    )}`
  );
  console.log(
    `Total time taken: ${Object.values(results).reduce(
      (acc, curr) => acc + curr.timeTaken,
      0
    )}`
  );

  console.log(
    `Average time taken per channel: ${
      Object.values(results).reduce((acc, curr) => acc + curr.timeTaken, 0) /
      Object.values(results).length
    }`
  );

  // Calculate peak memory delta from start
  const peakMemoryDelta = {
    rss: ((globalPeakMemory.rss - startMemory.rss) / 1024 / 1024).toFixed(2),
    heapTotal: (
      (globalPeakMemory.heapTotal - startMemory.heapTotal) /
      1024 /
      1024
    ).toFixed(2),
    heapUsed: (
      (globalPeakMemory.heapUsed - startMemory.heapUsed) /
      1024 /
      1024
    ).toFixed(2),
    external: (
      (globalPeakMemory.external - startMemory.external) /
      1024 /
      1024
    ).toFixed(2),
  };

  console.log(
    `Peak memory usage delta (MB): RSS=${peakMemoryDelta.rss}, Heap Total=${peakMemoryDelta.heapTotal}, Heap Used=${peakMemoryDelta.heapUsed}, External=${peakMemoryDelta.external}`
  );

  // Format posts as text with permalinks for output
  const textOnlyResults = Object.fromEntries(
    Object.entries(results).map(([channelHandle, result]) => [
      channelHandle,
      result.postsInRange.map((p) => `${p.text}\n\n${p.permalink}`),
    ])
  );

  const endMemory = process.memoryUsage();
  const memoryDelta = {
    rss: ((endMemory.rss - startMemory.rss) / 1024 / 1024).toFixed(2),
    heapTotal: (
      (endMemory.heapTotal - startMemory.heapTotal) /
      1024 /
      1024
    ).toFixed(2),
    heapUsed: (
      (endMemory.heapUsed - startMemory.heapUsed) /
      1024 /
      1024
    ).toFixed(2),
    external: (
      (endMemory.external - startMemory.external) /
      1024 /
      1024
    ).toFixed(2),
  };

  console.log(
    `Memory usage delta (MB): RSS=${memoryDelta.rss}, Heap Total=${memoryDelta.heapTotal}, Heap Used=${memoryDelta.heapUsed}, External=${memoryDelta.external}`
  );

  return textOnlyResults;
}
