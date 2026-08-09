import { threadIndex } from "../../../../lib/qdrant/threads";
import type { ThreadHit } from "../../../../lib/qdrant/threads";
import { defineRetrievalHint } from "../define-retrieval-hint";
import type { RetrievalHintSpec } from "../define-retrieval-hint";

export const DUPLICATE_THRESHOLD = 0.85;

/**
 * Thread↔thread duplicate detection. Unlike its three siblings this hint is
 * single-valued: synthesis wants one candidate to investigate, not a ranked
 * list, so `select` picks the best hit above the threshold rather than a top N.
 *
 * Never retires — a thread can be found a duplicate at any point in its life.
 */
export const duplicateHintSpec: RetrievalHintSpec<"duplicate", ThreadHit> = {
  kind: "duplicate",

  requiresEmbedding: true,

  retrieve({ embedding, organizationId, thread, tuning }) {
    return threadIndex.search(embedding as number[], {
      exclude: { threadId: [thread.id] },
      limit: tuning.limit,
      organizationId,
      scoreThreshold: tuning.scoreThreshold,
    });
  },

  /**
   * The index already applied the threshold and excluded the current thread.
   * Re-checking the score here is defense in depth, and lets an eval sweep the
   * threshold through the same code the pipeline runs.
   */
  select(hits, tuning) {
    let best: ThreadHit | null = null;
    for (const hit of hits) {
      if (hit.score < tuning.scoreThreshold) {
        continue;
      }
      if (!best || hit.score > best.score) {
        best = hit;
      }
    }
    if (!best) {
      return null;
    }
    return {
      score: best.score,
      shortDescription: best.payload.shortDescription,
      threadId: best.payload.threadId,
      title: best.payload.title ?? "",
    };
  },

  tuning: { limit: 5, scoreThreshold: DUPLICATE_THRESHOLD },
};

export const duplicateProcessor = defineRetrievalHint(duplicateHintSpec);
