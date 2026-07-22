import { createHash } from "node:crypto";

import type { RelatedPrsEvidence } from "@workspace/schemas/signals";
import { createLogger } from "@workspace/utils/logging";

import {
  PR_MATCH_THRESHOLD,
  searchSimilarPrs,
} from "../../../../lib/qdrant/pull-requests";
import { writeHintSlot } from "../../../../lib/read-hints";
import type { EmbedOutput, ParsedSummary } from "../../../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import { RELATED_PRS_LIMIT, toRelatedPrsEvidence } from "./find";

export interface RelatedPrsProcessorOutput {
  evidence: RelatedPrsEvidence | null;
}

const summaryHashInput = (summary: ParsedSummary): string =>
  Object.entries(summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .trim();

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Pull-side PR↔thread discovery (FRO-206). Searches the PR index for eligible
 * PRs similar to the thread embedding and writes a ranked `related_prs` hint;
 * synthesis can turn a strong lead into a `link_pr` read (after read_pr) without
 * a push-side `pr_matched` event. Mirrors the push-side match (FRO-205) — same
 * embedding space, same `PR_MATCH_THRESHOLD` — but runs on the thread pipeline.
 *
 * Skips once the thread already links a PR (`externalPrId`): there is nothing
 * left to suggest, so the hint is cleared rather than re-computed.
 */
export const relatedPrsProcessor: ProcessorDefinition<RelatedPrsProcessorOutput> =
  {
    name: "related_prs",

    dependencies: ["embed"],

    getIdempotencyKey(threadId: string): string {
      return `related_prs:${threadId}`;
    },

    // Linking a PR sets `externalPrId` without changing the thread embedding, so
    // `embed` skips and the deps-skip fast path would otherwise never re-run us
    // to clear a stale hint. Force the normal hash-based check for linked
    // threads: `computeHash` returns the "linked" hash, which differs from the
    // last summary-based hash and re-runs `execute` to clear the slot.
    runsWhenDependenciesSkipped(context: ProcessorExecuteContext): boolean {
      return Boolean(context.thread.externalPrId);
    },

    computeHash(context: ProcessorExecuteContext): string {
      const { context: jobContext, thread, threadId } = context;
      // A thread that already links a PR never produces evidence; keep its hash
      // stable so the skip is idempotent regardless of summary churn.
      if (thread.externalPrId) {
        return computeSha256("linked");
      }
      const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
        "summarize",
        threadId
      );
      if (!summarize) {
        return computeSha256("");
      }
      return computeSha256(summaryHashInput(summarize.summary));
    },

    async execute(
      context: ProcessorExecuteContext
    ): Promise<ProcessorResult<RelatedPrsProcessorOutput>> {
      const { context: jobContext, thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.related_prs",
        jobId: jobContext.jobId,
        organizationId: thread.organizationId,
        processor: "related_prs",
        threadId,
      });
      let status = 200;

      try {
        // Already linked to a PR — nothing to suggest. Clear any stale hint.
        if (thread.externalPrId) {
          await writeHintSlot(
            threadId,
            thread.organizationId,
            "related_prs",
            null,
            computeSha256("linked")
          );
          return {
            data: { evidence: null },
            success: true,
            threadId,
          };
        }

        const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
          "summarize",
          threadId
        );
        const hash = computeSha256(
          summarize ? summaryHashInput(summarize.summary) : ""
        );

        const embedOutput = jobContext.getProcessorOutput<EmbedOutput>(
          "embed",
          threadId
        );
        if (!embedOutput?.embedding) {
          status = 500;
          return {
            error: "No embedding available from embed processor",
            success: false,
            threadId,
          };
        }

        // Same vector space as the push side: thread embedding against eligible
        // PRs above the shared match threshold, ranked, top N. A backend failure
        // throws (see `searchSimilarPrs`) so we fall through to the catch and
        // leave the prior hint untouched instead of clearing a valid lead.
        const hits = await searchSimilarPrs(embedOutput.embedding, {
          limit: RELATED_PRS_LIMIT,
          organizationId: thread.organizationId,
          scoreThreshold: PR_MATCH_THRESHOLD,
        });

        const evidence = toRelatedPrsEvidence(hits);

        await writeHintSlot(
          threadId,
          thread.organizationId,
          "related_prs",
          evidence,
          hash
        );

        return {
          data: { evidence },
          success: true,
          threadId,
        };
      } catch (error) {
        status = 500;
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `Related PRs processor failed for thread ${threadId}:`,
          error
        );
        requestLog.error(
          `Related PRs failed for thread ${threadId}: ${message}`
        );
        return { error: message, success: false, threadId };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
