import type { DuplicateEvidence } from "@workspace/schemas/signals";
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

export function toDuplicateEvidence(
  candidate: DuplicateCandidate,
  results: SimilarThreadResult[],
): DuplicateEvidence | null {
  if (!candidate) return null;
  const match = results.find((r) => r.threadId === candidate.targetThreadId);
  return {
    threadId: candidate.targetThreadId,
    score: candidate.score,
    title: match?.payload.title ?? "",
    shortDescription: match?.payload.shortDescription,
  };
}

export function pickDuplicateEvidence(
  results: SimilarThreadResult[],
  opts: { threshold: number },
): DuplicateEvidence | null {
  return toDuplicateEvidence(findDuplicateCandidate(results, opts), results);
}
