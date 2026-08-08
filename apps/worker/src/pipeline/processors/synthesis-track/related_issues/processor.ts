import {
  ISSUE_MATCH_THRESHOLD,
  issueIndex,
} from "../../../../lib/qdrant/issues";
import type { IssueHit } from "../../../../lib/qdrant/issues";
import { defineRetrievalHint } from "../define-retrieval-hint";
import type { RetrievalHintSpec } from "../define-retrieval-hint";

/**
 * Pull-side issue↔thread discovery (FRO-217). Searches the [issue
 * index](../../../../../../CONTEXT.md) for issues similar to the thread
 * embedding; synthesis can turn a strong lead into a `link_issue` read (after
 * read_issue), or read it as a reason *not* to file a new issue.
 *
 * The counterpart of `related_prs`, with one deliberate difference: the issue
 * index has no eligibility filter, so closed issues come back too. This is the
 * only discovery path for issues — there is no push-side `issue_matched`
 * trigger.
 *
 * Retires once the thread links an issue.
 */
export const relatedIssuesHintSpec: RetrievalHintSpec<
  "related_issues",
  IssueHit
> = {
  count: (evidence) => evidence.issues.length,

  kind: "related_issues",

  requiresEmbedding: true,

  retiredBy: "externalIssueId",

  retrieve({ embedding, organizationId, tuning }) {
    return issueIndex.search(embedding as number[], {
      limit: tuning.limit,
      organizationId,
      scoreThreshold: tuning.scoreThreshold,
    });
  },

  /**
   * `state` is carried through rather than filtered on: a closed issue is often
   * the best answer ("this was fixed in #412") and the strongest argument
   * against filing a new one, so synthesis — not this function — decides what
   * it means.
   */
  select(hits, tuning) {
    const issues = hits
      .toSorted((a, b) => b.score - a.score)
      .slice(0, tuning.limit)
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
    return issues.length > 0 ? { issues } : null;
  },

  tuning: { limit: 5, scoreThreshold: ISSUE_MATCH_THRESHOLD },
};

export const relatedIssuesProcessor =
  defineRetrievalHint(relatedIssuesHintSpec);
