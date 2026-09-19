import OpenAI from "openai";

/**
 * Embedding client — works with any **OpenAI-compatible** `/embeddings` endpoint.
 *
 * Defaults preserve upstream behaviour (OpenAI `text-embedding-3-small`), but the env vars
 * below let you point it at whichever provider you already pay for — no OpenAI account
 * required:
 *
 *   EMBEDDING_API_URL   e.g. https://dashscope.aliyuncs.com/compatible-mode/v1  (Qwen / Bailian)
 *                            https://open.bigmodel.cn/api/paas/v4                 (Zhipu GLM)
 *   EMBEDDING_API_KEY   provider key (falls back to OPENAI_API_KEY)
 *   EMBEDDING_MODEL     e.g. text-embedding-v4 (Qwen) / embedding-3 (Zhipu)
 *   EMBEDDING_BATCH     max texts per request (default 10, see below)
 *
 * Vector length differs per model (OpenAI small = 1536, Qwen v4 = 1024, Zhipu embedding-3 = 2048).
 * That is fine — clustering only uses cosine similarity — but re-check
 * EMBEDDING_DEDUP_THRESHOLD when you switch provider (see embeddingDedup.ts).
 *
 * Two provider traps this module defends against (both verified against the live APIs):
 *
 *  1. `encoding_format`. Since openai-node v5 the SDK defaults it to "base64" and then
 *     base64-decodes the response *unconditionally*. Providers that ignore the flag and
 *     return float arrays produce silently garbage vectors with no error. Verified: Zhipu
 *     returns dim=512 all-zeros (cosine = NaN) when the flag is omitted. We always pin "float".
 *
 *  2. Batch size. DashScope/`text-embedding-v4` rejects any request with more than 10 inputs
 *     ("batch size is invalid, it should not be larger than 10"), so one big request would
 *     400 and silently degrade the whole dedup stage back to the expensive LLM path.
 *     We therefore split into chunks of EMBEDDING_BATCH and stitch the results back in order.
 */
let _client: OpenAI | null = null;
/** Signature (baseURL + key) the cached client was built for — see client(). */
let _clientSig = "";

function apiKey(): string {
  return process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || "";
}

function model(): string {
  return process.env.EMBEDDING_MODEL || "text-embedding-3-small";
}

/** Max texts per request. Default 10 = the strictest limit seen across providers. */
function batchSize(): number {
  const n = Number(process.env.EMBEDDING_BATCH ?? 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
}

function client(): OpenAI {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "Embedding API key is not set (set EMBEDDING_API_KEY, or OPENAI_API_KEY for the default OpenAI endpoint)"
    );
  }
  const baseURL = process.env.EMBEDDING_API_URL;
  // Rebuild when the endpoint or the key changes. A plain `if (!_client)` cache would keep
  // serving the *first* configured provider after a later reconfiguration, so a request for
  // another provider's model would be sent to the wrong host (which answers a confusing
  // "model does not exist" instead of failing where you'd expect).
  const sig = `${baseURL ?? ""}\u0000${key}`;
  if (!_client || _clientSig !== sig) {
    _client = baseURL ? new OpenAI({ apiKey: key, baseURL }) : new OpenAI({ apiKey: key });
    _clientSig = sig;
  }
  return _client;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One request for one batch, with a bounded retry for transient throttling/5xx. */
async function embedBatch(texts: string[]): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client().embeddings.create({
        model: model(),
        input: texts,
        encoding_format: "float", // trap 1 — see header
      });
      // Providers carry an `index`; sort so vectors always line up with the input order.
      const vectors = response.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
      if (vectors.length !== texts.length) {
        throw new Error(
          `Embedding count mismatch: sent ${texts.length}, got ${vectors.length}`
        );
      }
      return vectors;
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
      const status = (e as { status?: number })?.status;
      // Retry only throttling / server errors / transport failures. A 4xx (bad request,
      // wrong model, bad key) will not self-heal, so it is surfaced immediately.
      const retryable =
        (typeof status === "number" && status >= 500) ||
        /\b(429|500|502|503|504)\b/.test(msg) ||
        /timeout|ECONNRESET|fetch failed/i.test(msg);
      if (!retryable || attempt === 2) break;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * Batch embedding — chunks the input to respect provider batch limits and returns one
 * vector per input text, in input order.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (const part of chunk(texts, batchSize())) {
    out.push(...(await embedBatch(part)));
  }
  assertUsable(out);
  return out;
}

/**
 * Reject degenerate vectors so a silently broken provider surfaces as a *throw*
 * (→ caller falls back to the LLM dedup path) instead of producing NaN cosines that make
 * deduplication quietly a no-op.
 */
function assertUsable(vectors: number[][]): void {
  if (vectors.length === 0) return;
  const dim = vectors[0]?.length ?? 0;
  if (!dim) {
    throw new Error("Embedding response contained empty vectors");
  }
  for (const v of vectors) {
    if (v.length !== dim) {
      throw new Error(`Embedding dimension mismatch: ${v.length} vs ${dim}`);
    }
    let normSq = 0;
    for (const x of v) {
      if (!Number.isFinite(x)) throw new Error("Embedding contained a non-finite value");
      normSq += x * x;
    }
    if (normSq === 0) {
      // The exact signature of a mis-decoded (base64) response — fail loudly.
      throw new Error(
        "Embedding returned an all-zero vector — provider likely ignored `encoding_format`"
      );
    }
  }
}

export async function getEmbedding(text: string): Promise<number[]> {
  const emb = await getEmbeddings([text]);
  return emb[0];
}
