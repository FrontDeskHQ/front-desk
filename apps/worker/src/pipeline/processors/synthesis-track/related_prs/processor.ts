import {
  PR_MATCH_THRESHOLD,
  prIndex,
} from "../../../../lib/qdrant/pull-requests";
import type { PrHit } from "../../../../lib/qdrant/pull-requests";
import { defineRetrievalHint } from "../define-retrieval-hint";
import type { RetrievalHintSpec } from "../define-retrieval-hint";

/**
 * Pull-side PR↔thread discovery (FRO-206). Searches the [PR
 * index](../../../../../../CONTEXT.md) for eligible PRs similar to the thread
 * embedding; synthesis can turn a strong lead into a `link_pr` read (after
 * read_pr) without a push-side `pr_matched` event. Mirrors the push-side match
 * (FRO-205) — same embedding space, same threshold — but runs on the thread
 * pipeline.
 *
 * Retires once the thread links a PR: there is nothing left to suggest.
 */
export const relatedPrsHintSpec: RetrievalHintSpec<"related_prs", PrHit> = {
  count: (evidence) => evidence.prs.length,

  kind: "related_prs",

  requiresEmbedding: true,

  retiredBy: "externalPrId",

  retrieve({ embedding, organizationId, tuning }) {
    return prIndex.search(embedding as number[], {
      limit: tuning.limit,
      organizationId,
      scoreThreshold: tuning.scoreThreshold,
      where: { eligible: true },
    });
  },

  /**
   * The index already filtered to eligible PRs above the threshold and ranked
   * them; keep the top N and drop to the fields synthesis needs (`url` for
   * read_pr / link_pr, `prId` to resolve the mirror row).
   */
  select(hits, tuning) {
    const prs = hits
      .toSorted((a, b) => b.score - a.score)
      .slice(0, tuning.limit)
      .map((hit) => ({
        externalKey: hit.payload.externalKey,
        number: hit.payload.number,
        prId: hit.payload.externalEntityId,
        repoFullName: hit.payload.repoFullName,
        score: hit.score,
        title: hit.payload.title,
        url: hit.payload.url,
      }));
    return prs.length > 0 ? { prs } : null;
  },

  tuning: { limit: 5, scoreThreshold: PR_MATCH_THRESHOLD },
};

export const relatedPrsProcessor = defineRetrievalHint(relatedPrsHintSpec);
