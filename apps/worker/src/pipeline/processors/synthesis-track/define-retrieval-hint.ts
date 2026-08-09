import { createHash } from "node:crypto";

import type { HintKind } from "@workspace/schemas/signals";
import { createLogger } from "@workspace/utils/logging";

import { isRetryableError } from "../../../lib/logging";
import type { EmbedOutput, ParsedSummary, Thread } from "../../../types";
import type { SlotEvidenceMap } from "../../core/run-state";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../core/types";
import type { SummarizeOutput } from "../summarize";

/**
 * Every [hint processor](../../../../CONTEXT.md) that works by retrieval does
 * the same eight things: hash the summary, opt out of the dependencies-skipped
 * fast path when the hint can go stale without the embedding changing, clear
 * itself once the thread links the thing it was suggesting, read the thread
 * embedding, run one search, shape the hits into evidence, write the slot, and
 * log the outcome. Only the search and the shaping differ.
 *
 * This module owns the eight; a {@link RetrievalHintSpec} supplies the two.
 * Adding a hint kind is still "a hint processor + an evidence slot" (ADR 0005) —
 * the spec *is* the hint processor.
 *
 * **Failure preserves the prior hint.** A retrieval that throws falls through to
 * the catch without writing, so a transient backend failure leaves the last good
 * evidence in place instead of replacing it with "no evidence". Retrieval that
 * legitimately finds nothing returns an empty list and does clear the slot.
 */

/** The retrieval knobs for one hint, and the defaults its shaping uses. */
export interface RetrievalTuning {
  limit: number;
  scoreThreshold: number;
}

export interface RetrievalInput {
  thread: Thread;
  organizationId: string;
  /** Thread embedding, or null when `embed` produced none. */
  embedding: number[] | null;
  /** Summary from `summarize`, or null when it did not run. */
  summary: ParsedSummary | null;
  tuning: RetrievalTuning;
}

export interface RetrievalHintSpec<K extends HintKind, THit> {
  kind: K;
  /**
   * A thread column whose presence retires this hint: once the thread links the
   * entity, there is nothing left to suggest and the slot is cleared rather than
   * recomputed. Omit for hints that never stop being relevant.
   */
  retiredBy?: "externalPrId" | "externalIssueId";
  /**
   * Whether a missing thread embedding is a failure. False for hints that search
   * by text rather than by vector.
   */
  requiresEmbedding: boolean;
  tuning: RetrievalTuning;
  /** Run the search. Throwing preserves the prior hint; returning [] clears it. */
  retrieve(input: RetrievalInput): Promise<THit[]>;
  /**
   * Rank and shape hits into evidence, or null for "no evidence". Takes tuning
   * as a parameter rather than closing over it so evals can sweep thresholds
   * and limits through the same code the pipeline runs.
   */
  select(hits: THit[], tuning: RetrievalTuning): SlotEvidenceMap[K] | null;
  /** How many pieces of evidence this is, for logging. Defaults to 0 or 1. */
  count?(evidence: SlotEvidenceMap[K]): number;
}

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

const summaryHashInput = (summary: ParsedSummary): string =>
  Object.entries(summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .trim();

/**
 * The hash a retired hint keeps. Stable regardless of summary churn, so the
 * skip stays idempotent, and different from any summary hash, so the run that
 * retires the hint still fires once to clear it.
 */
const RETIRED_HASH = computeSha256("linked");

export interface RetrievalHintOutput<K extends HintKind> {
  evidence: SlotEvidenceMap[K] | null;
}

export const defineRetrievalHint = <K extends HintKind, THit>(
  spec: RetrievalHintSpec<K, THit>
): ProcessorDefinition<RetrievalHintOutput<K>> => {
  const { kind, retiredBy, tuning } = spec;

  const isRetired = (thread: Thread): boolean =>
    Boolean(retiredBy && thread[retiredBy]);

  const summaryOf = (context: ProcessorExecuteContext): ParsedSummary | null =>
    context.context.getProcessorOutput<SummarizeOutput>(
      "summarize",
      context.threadId
    )?.summary ?? null;

  return {
    name: kind,

    dependencies: ["embed"],

    getIdempotencyKey(threadId: string): string {
      return `${kind}:${threadId}`;
    },

    // Linking *and* unlinking move the retiring column without changing the
    // thread embedding, so `embed` skips and the deps-skip fast path would never
    // re-run us — leaving a stale hint after a link, or a permanently cleared
    // one after an unlink. Opt every retiring hint out of the fast path and let
    // the hash comparison decide; in steady state the hashes match and it skips
    // anyway.
    runsWhenDependenciesSkipped(): boolean {
      return Boolean(retiredBy);
    },

    computeHash(context: ProcessorExecuteContext): string {
      if (isRetired(context.thread)) {
        return RETIRED_HASH;
      }
      const summary = summaryOf(context);
      return computeSha256(summary ? summaryHashInput(summary) : "");
    },

    async execute(
      context: ProcessorExecuteContext
    ): Promise<ProcessorResult<RetrievalHintOutput<K>>> {
      const { context: jobContext, run, thread, threadId } = context;
      const requestLog = createLogger({
        action: `pipeline.${kind}`,
        jobId: jobContext.jobId,
        organizationId: thread.organizationId,
        processor: kind,
        threadId,
      });
      let status = 200;

      try {
        if (isRetired(thread)) {
          await run.writeHint(kind, null, RETIRED_HASH);
          requestLog.set({
            outcome: { status: "skipped", reason: "already_linked" },
          });
          return { data: { evidence: null }, success: true, threadId };
        }

        const summary = summaryOf(context);
        const hash = computeSha256(
          summary ? summaryHashInput(summary) : ""
        );

        const embedding =
          jobContext.getProcessorOutput<EmbedOutput>("embed", threadId)
            ?.embedding ?? null;
        if (spec.requiresEmbedding && !embedding) {
          status = 500;
          requestLog.set({
            outcome: { status: "failed", reason: "embedding_missing" },
          });
          return {
            error: "No embedding available from embed processor",
            success: false,
            threadId,
          };
        }

        const hits = await spec.retrieve({
          embedding,
          organizationId: thread.organizationId,
          summary,
          thread,
          tuning,
        });

        const evidence = spec.select(hits, tuning);

        await run.writeHint(kind, evidence, hash);

        requestLog.set({
          outcome: {
            status: "completed",
            evidenceCount: evidence
              ? (spec.count?.(evidence) ?? 1)
              : 0,
          },
          search: {
            candidateCount: hits.length,
            limit: tuning.limit,
            scoreThreshold: tuning.scoreThreshold,
          },
        });

        return { data: { evidence }, success: true, threadId };
      } catch (error) {
        status = 500;
        const message = error instanceof Error ? error.message : String(error);
        requestLog.error(error instanceof Error ? error : String(error), {
          retryable: isRetryableError(error),
          step: kind,
        });
        requestLog.set({ outcome: { status: "failed" } });
        return { error: message, success: false, threadId };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
};
