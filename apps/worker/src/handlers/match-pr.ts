import type { PrMatchJobData } from "@workspace/schemas/signals";
import { createAILogger } from "@workspace/utils/logging";
import type { Job } from "bullmq";

import { AI_PRICING } from "../lib/ai-pricing";
import { fetchClient } from "../lib/database/client";
import { createWorkerJobLogger, isRetryableError } from "../lib/logging";
import { buildPrEmbedText, generatePrEmbedding } from "../lib/pr-embedding";
import {
  PR_MATCH_CANDIDATE_LIMIT,
  PR_MATCH_RETRIEVAL_FLOOR,
  PR_MATCH_RERANK_THRESHOLD,
} from "../lib/pr-match-config";
import { rerankPrMatches } from "../lib/pr-match-reranker";
import { threadIndex } from "../lib/qdrant/threads";

/** Open (0) and In progress (1) — the only threads a PR match may light up. */
const ACTIVE_STATUSES = [0, 1];

/**
 * Push-side PR↔thread discovery (FRO-205). A GitHub webhook enqueues this when
 * an eligible PR opens / reopens / becomes ready-for-review / is edited. The
 * handler embeds the PR, searches for similar Open / In-progress threads, and
 * hands the candidates to the API, which filters to *unlinked* threads and fans
 * out one `pr_matched` thread read per match (ADR 0006 trigger channel).
 *
 * Eligibility (open, non-draft) is re-derived here from `state` / `draft` rather
 * than trusted from the enqueue, so a job that raced a since-closed / re-drafted
 * PR is dropped instead of matching a dead PR.
 */
export const handleMatchPr = async (job: Job<PrMatchJobData>) => {
  const { data } = job;
  const { organizationId, externalKey } = data;
  const requestLog = createWorkerJobLogger("pr-match", job, "pr.match", {
    pr: {
      externalKey,
      organizationId,
      state: data.state,
      draft: data.draft ?? false,
    },
    matching: {
      activeStatuses: ACTIVE_STATUSES,
      candidateLimit: PR_MATCH_CANDIDATE_LIMIT,
      retrievalFloor: PR_MATCH_RETRIEVAL_FLOOR,
      rerankThreshold: PR_MATCH_RERANK_THRESHOLD,
    },
  });
  const ai = createAILogger(requestLog, { cost: AI_PRICING });
  let status = 200;

  try {
    const eligible = data.state === "open" && data.draft !== true;
    if (!eligible) {
      requestLog.set({
        outcome: {
          action: "skipped",
          reason: "ineligible",
        },
      });
      return { action: "skipped" as const, externalKey };
    }

    const embedText = buildPrEmbedText(data);
    const embedding = await generatePrEmbedding(embedText, requestLog);
    if (!embedding) {
      throw new Error(`Failed to embed PR ${externalKey}`);
    }

    const matches = await threadIndex.search(embedding, {
      limit: PR_MATCH_CANDIDATE_LIMIT,
      organizationId,
      scoreThreshold: PR_MATCH_RETRIEVAL_FLOOR,
      where: { status: ACTIVE_STATUSES },
    });
    requestLog.set({
      matching: {
        embeddingDimensions: embedding.length,
        candidateCount: matches.length,
        retrievalCount: matches.length,
        topScore: matches[0]?.score ?? null,
        candidateThreadIds: matches.map((match) => match.payload.threadId),
      },
    });

    if (matches.length === 0) {
      requestLog.set({
        outcome: {
          action: "matched",
          candidateCount: 0,
          enqueued: 0,
          reason: "no_similar_active_threads",
        },
      });
      return { action: "matched" as const, enqueued: 0, externalKey };
    }

    const reranked = await rerankPrMatches(data, matches, ai);
    const acceptedMatches = reranked
      .filter((match) => match.accepted)
      .map((match) => ({
        threadId: match.threadId,
        score: match.retrievalScore,
      }));

    requestLog.set({
      matching: {
        reranking: {
          acceptedCount: acceptedMatches.length,
          candidateCount: reranked.length,
          decisions: reranked.map((match) => ({
            accepted: match.accepted,
            reason: match.reason,
            rerankScore: match.rerankScore,
            retrievalScore: match.retrievalScore,
            threadId: match.threadId,
          })),
          threshold: PR_MATCH_RERANK_THRESHOLD,
        },
      },
    });

    if (acceptedMatches.length === 0) {
      requestLog.set({
        outcome: {
          action: "matched",
          candidateCount: matches.length,
          enqueued: 0,
          reason: "rejected_by_reranker",
        },
      });
      return { action: "matched" as const, enqueued: 0, externalKey };
    }

    // The API owns the authoritative unlinked-thread filter (the vector payload's
    // status can lag the mirror) and the thread-read enqueue with its ADR-0006
    // coalescing, so hand it the raw candidates and let it fan out.
    const { dispositions, enqueued, unavailable } =
      await fetchClient.mutate.externalEntity.fanOutPrMatch({
        externalKey,
        matches: acceptedMatches,
        organizationId,
      });

    requestLog.set({
      outcome: {
        action: "matched",
        candidateCount: matches.length,
        dispositions,
        enqueued,
        unavailable,
        reason:
          unavailable > 0 && enqueued === 0
            ? "queue_unavailable"
            : enqueued === 0
              ? "no_candidates_enqueued"
              : "enqueued",
      },
    });
    return {
      action: "matched" as const,
      enqueued,
      externalKey,
      unavailable,
    };
  } catch (error) {
    status = 500;
    requestLog.error(error instanceof Error ? error : String(error), {
      step: "pr.match",
      retryable: isRetryableError(error),
    });
    throw error;
  } finally {
    requestLog.emit({ status });
  }
};
