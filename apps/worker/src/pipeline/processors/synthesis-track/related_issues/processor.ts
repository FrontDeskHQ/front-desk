import { createHash } from "node:crypto";

import type { RelatedIssuesEvidence } from "@workspace/schemas/signals";
import { createLogger } from "@workspace/utils/logging";

import { isRetryableError } from "../../../../lib/logging";
import {
  ISSUE_MATCH_THRESHOLD,
  searchSimilarIssues,
} from "../../../../lib/qdrant/issues";
import { writeHintSlot } from "../../../../lib/read-hints";
import type { EmbedOutput, ParsedSummary } from "../../../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import { RELATED_ISSUES_LIMIT, toRelatedIssuesEvidence } from "./find";

export interface RelatedIssuesProcessorOutput {
  evidence: RelatedIssuesEvidence | null;
}

const summaryHashInput = (summary: ParsedSummary): string =>
  Object.entries(summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .trim();

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Pull-side issue↔thread discovery (FRO-217). Searches the issue index for
 * issues similar to the thread embedding and writes a ranked `related_issues`
 * hint; synthesis can turn a strong lead into a `link_issue` read (after
 * read_issue), or read it as a reason *not* to file a new issue.
 *
 * The counterpart of `related_prs`, with one deliberate difference: there is no
 * eligibility filter, so closed issues come back too. This is the only discovery
 * path for issues — there is no push-side `issue_matched` trigger.
 *
 * Skips once the thread already links an issue (`externalIssueId`): there is
 * nothing left to suggest, so the hint is cleared rather than re-computed.
 */
export const relatedIssuesProcessor: ProcessorDefinition<RelatedIssuesProcessorOutput> =
  {
    name: "related_issues",

    dependencies: ["embed"],

    getIdempotencyKey(threadId: string): string {
      return `related_issues:${threadId}`;
    },

    // Linking an issue sets `externalIssueId` without changing the thread
    // embedding, so `embed` skips and the deps-skip fast path would otherwise
    // never re-run us to clear a stale hint. Force the normal hash-based check
    // for linked threads (see `computeHash`).
    runsWhenDependenciesSkipped(context: ProcessorExecuteContext): boolean {
      return Boolean(context.thread.externalIssueId);
    },

    computeHash(context: ProcessorExecuteContext): string {
      const { context: jobContext, thread, threadId } = context;
      // A thread that already links an issue never produces evidence; keep its
      // hash stable so the skip is idempotent regardless of summary churn.
      if (thread.externalIssueId) {
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
    ): Promise<ProcessorResult<RelatedIssuesProcessorOutput>> {
      const { context: jobContext, thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.related_issues",
        jobId: jobContext.jobId,
        organizationId: thread.organizationId,
        processor: "related_issues",
        threadId,
      });
      let status = 200;

      try {
        // Already linked to an issue — nothing to suggest. Clear any stale hint.
        if (thread.externalIssueId) {
          await writeHintSlot(
            threadId,
            thread.organizationId,
            "related_issues",
            null,
            computeSha256("linked")
          );
          requestLog.set({
            outcome: { status: "skipped", reason: "already_linked" },
          });
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
          requestLog.set({
            outcome: { status: "failed", reason: "embedding_missing" },
          });
          return {
            error: "No embedding available from embed processor",
            success: false,
            threadId,
          };
        }

        // Thread embedding against every indexed issue above the match
        // threshold, ranked, top N. A backend failure throws (see
        // `searchSimilarIssues`) so we fall through to the catch and leave the
        // prior hint untouched instead of clearing a valid lead.
        const hits = await searchSimilarIssues(embedOutput.embedding, {
          limit: RELATED_ISSUES_LIMIT,
          organizationId: thread.organizationId,
          scoreThreshold: ISSUE_MATCH_THRESHOLD,
        });

        const evidence = toRelatedIssuesEvidence(hits);

        await writeHintSlot(
          threadId,
          thread.organizationId,
          "related_issues",
          evidence,
          hash
        );

        requestLog.set({
          search: {
            candidateCount: hits.length,
            limit: RELATED_ISSUES_LIMIT,
            scoreThreshold: ISSUE_MATCH_THRESHOLD,
          },
          outcome: {
            status: "completed",
            evidenceCount: evidence?.issues.length ?? 0,
          },
        });

        return {
          data: { evidence },
          success: true,
          threadId,
        };
      } catch (error) {
        status = 500;
        const message = error instanceof Error ? error.message : String(error);
        requestLog.error(error instanceof Error ? error : String(error), {
          retryable: isRetryableError(error),
          step: "related_issues",
        });
        requestLog.set({ outcome: { status: "failed" } });
        return { error: message, success: false, threadId };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
