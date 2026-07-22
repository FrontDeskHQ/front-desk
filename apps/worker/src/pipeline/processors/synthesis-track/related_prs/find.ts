import type { RelatedPrEvidenceItem } from "@workspace/schemas/signals";
import type { SimilarPrResult } from "../../../../lib/qdrant/pull-requests";

/** How many ranked PRs the hint carries at most. */
export const RELATED_PRS_LIMIT = 5;

/**
 * Shape a ranked list of eligible-PR similarity hits into `related_prs`
 * evidence. `searchSimilarPrs` already filters to eligible PRs above the score
 * threshold and returns them ranked; we keep the top N and drop to the fields
 * synthesis needs (`url` for read_pr / link_pr, `prId` to resolve the row).
 */
export function toRelatedPrsEvidence(
  hits: SimilarPrResult[],
  opts: { limit?: number } = {},
): { prs: RelatedPrEvidenceItem[] } | null {
  const limit = opts.limit ?? RELATED_PRS_LIMIT;
  const prs: RelatedPrEvidenceItem[] = hits
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => ({
      externalKey: hit.payload.externalKey,
      prId: hit.payload.externalEntityId,
      url: hit.payload.url,
      title: hit.payload.title,
      repoFullName: hit.payload.repoFullName,
      number: hit.payload.number,
      score: hit.score,
    }));

  if (prs.length === 0) return null;
  return { prs };
}
