import type { SimilarThreadResult } from "../../../../lib/qdrant/threads";

export type DuplicateCandidate = {
  targetThreadId: string;
  score: number;
} | null;

export function findDuplicateCandidate(
  results: SimilarThreadResult[],
  opts: { threshold: number },
): DuplicateCandidate {
  let best: SimilarThreadResult | null = null;
  for (const r of results) {
    if (r.score < opts.threshold) continue;
    if (!best || r.score > best.score) best = r;
  }
  if (!best) return null;
  return { targetThreadId: best.threadId, score: best.score };
}
