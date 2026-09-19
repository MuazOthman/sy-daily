/**
 * Quality gate — pure-local, 0-LLM-token pre-filter applied before the (expensive)
 * dedup / summarize LLM stages. Drops junk and exact-duplicate raw posts so they never
 * reach the model. Conservative by design: only removes too-short items and exact-hash
 * duplicates; it never semantically merges anything.
 *
 * This is the cheapest possible win: every item removed here saves both the dedup AND the
 * (downstream) summarize LLM calls.
 */
import crypto from "node:crypto";

export interface QualityGateStats {
  total: number;
  tooShort: number;
  exactDuplicate: number;
  passed: number;
}

export interface QualityGateResult {
  items: string[];
  stats: QualityGateStats;
}

function normalize(text: string): string {
  return text
    .replace(/[​-‍﻿]/g, "") // zero-width chars / BOM
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function qualityGate(
  items: string[],
  opts: { minChars?: number } = {}
): QualityGateResult {
  const minChars = opts.minChars ?? Number(process.env.QUALITY_GATE_MIN_CHARS ?? 80);
  const enabled = (process.env.QUALITY_GATE ?? "1") === "1";

  if (!enabled) {
    return {
      items,
      stats: {
        total: items.length,
        tooShort: 0,
        exactDuplicate: 0,
        passed: items.length,
      },
    };
  }

  const seen = new Set<string>();
  const out: string[] = [];
  let tooShort = 0;
  let exactDuplicate = 0;

  for (const it of items) {
    const norm = normalize(it);
    if (norm.length < minChars) {
      tooShort++;
      continue;
    }
    const h = crypto.createHash("sha256").update(norm).digest("hex");
    if (seen.has(h)) {
      exactDuplicate++;
      continue;
    }
    seen.add(h);
    out.push(it);
  }

  return {
    items: out,
    stats: {
      total: items.length,
      tooShort,
      exactDuplicate,
      passed: out.length,
    },
  };
}
