import type { RelatedIssueEvidenceItem } from "@workspace/schemas/signals";

import type { IssueHit } from "../../../../lib/qdrant/issues";

/** How many ranked issues the hint carries at most. */
export const RELATED_ISSUES_LIMIT = 5;

/**
 * Shape a ranked list of issue similarity hits into `related_issues` evidence.
 * `issueIndex.search` already filters to the org above the score threshold and
 * returns them ranked; we keep the top N and drop to the fields synthesis needs
 * (`url` for read_issue / link_issue, `issueId` to resolve the row).
 *
 * `state` is carried through rather than filtered on: a closed issue is often
 * the best answer ("this was fixed in #412") and the strongest argument against
 * filing a new one, so synthesis — not this function — decides what it means.
 */
export function toRelatedIssuesEvidence(
  hits: IssueHit[],
  opts: { limit?: number } = {}
): { issues: RelatedIssueEvidenceItem[] } | null {
  const limit = opts.limit ?? RELATED_ISSUES_LIMIT;
  const issues: RelatedIssueEvidenceItem[] = hits
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => ({
      externalKey: hit.payload.externalKey,
      issueId: hit.payload.externalEntityId,
      number: hit.payload.number,
      repoFullName: hit.payload.repoFullName,
      score: hit.score,
      state: hit.payload.state,
      title: hit.payload.title,
      url: hit.payload.url,
    }));

  if (issues.length === 0) {
    return null;
  }
  return { issues };
}
