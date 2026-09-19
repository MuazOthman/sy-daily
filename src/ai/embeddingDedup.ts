/**
 * Embedding-based deduplication — replaces the (very expensive) multi-round gpt-4.1
 * reasoning-high LLM merge with cheap embedding vectors + cosine clustering.
 *
 * For each raw post we embed once (see embedding.ts for the provider setup), cluster by
 * cosine similarity, then within each cluster keep the most comprehensive post as the
 * representative and union all source URLs. This yields the same `SimplifiedNewsItem[]`
 * shape the downstream Summarize stage expects, at a tiny fraction of the token cost.
 * Any failure propagates to the caller, which falls back to the original LLM dedup path.
 *
 * Threshold calibration (measured against the live endpoints, 2026-09-19):
 *
 *   pair type                     Qwen text-embedding-v4   Zhipu embedding-3
 *   ----------------------------------------------------- ------------------
 *   same event, reworded                       0.967              0.903
 *   same event, more/less detail               0.826              0.851   <- must merge
 *   same topic, different event                0.678              0.639   <- must NOT merge
 *   same domain, unrelated                     0.580              0.564
 *   unrelated                                  0.282              0.311
 *
 * 0.78 sits in the gap between the two bold rows for *both* providers, which is why it is the
 * default rather than the original 0.85 — at 0.85 a genuine same-event pair with differing
 * detail (0.826) fell just below the line and was missed. Set EMBEDDING_DEDUP_THRESHOLD to
 * re-tune; re-measure whenever you change provider or model.
 */
import { getEmbeddings } from "./embedding";
import { SimplifiedNewsItem } from "../types";

const URL_RE = /https?:\/\/[^\s)\]<>]+/gi;

/** Pull every URL out of a post's text (used to populate SimplifiedNewsItem.sources). */
export function extractSources(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  const cleaned = matches.map((m) => m.replace(/[.,;:]+$/, ""));
  return Array.from(new Set(cleaned));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

interface Cluster {
  repIndex: number; // index of the (longest) representative in `items`
  members: number[];
  vec: number[]; // representative vector used for future comparisons
}

export async function embeddingDeduplicate(
  items: string[]
): Promise<SimplifiedNewsItem[]> {
  if (items.length === 0) return [];

  // Default 0.78 — see the calibration table in the file header. Provider-agnostic.
  const threshold = Number(process.env.EMBEDDING_DEDUP_THRESHOLD ?? 0.78);
  // Throws if no embedding endpoint/key is configured, or if the provider returns
  // degenerate vectors → caller falls back to the original LLM dedup path.
  const embeddings = await getEmbeddings(items);

  const clusters: Cluster[] = [];
  for (let i = 0; i < items.length; i++) {
    let best = -1;
    let bestSim = -1;
    for (let c = 0; c < clusters.length; c++) {
      const sim = cosine(embeddings[i], clusters[c].vec);
      if (sim > bestSim) {
        bestSim = sim;
        best = c;
      }
    }
    if (best >= 0 && bestSim >= threshold) {
      clusters[best].members.push(i);
      // Promote the longer post to representative so the final text is the most comprehensive.
      if (items[i].length > items[clusters[best].repIndex].length) {
        clusters[best].repIndex = i;
        clusters[best].vec = embeddings[i];
      }
    } else {
      clusters.push({ repIndex: i, members: [i], vec: embeddings[i] });
    }
  }

  return clusters.map((cl): SimplifiedNewsItem => {
    const rep = items[cl.repIndex];
    const sources = Array.from(
      new Set(cl.members.flatMap((m) => extractSources(items[m])))
    );
    return {
      text: rep,
      sources: sources.length ? sources : ["unknown-source"],
    };
  });
}
