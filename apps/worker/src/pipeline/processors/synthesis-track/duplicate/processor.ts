import { createHash } from "node:crypto";

import type { DuplicateEvidence } from "@workspace/schemas/signals";
import { createLogger } from "@workspace/utils/logging";

import { isRetryableError } from "../../../../lib/logging";
import { searchSimilarThreads } from "../../../../lib/qdrant/threads";
import type { EmbedOutput, ParsedSummary } from "../../../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import { pickDuplicateEvidence } from "./find";

export const DUPLICATE_THRESHOLD = 0.85;

export interface DuplicateProcessorOutput {
  evidence: DuplicateEvidence | null;
}

const summaryHashInput = (summary: ParsedSummary): string =>
  Object.entries(summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .trim();

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

export const duplicateProcessor: ProcessorDefinition<DuplicateProcessorOutput> =
  {
    computeHash(context: ProcessorExecuteContext): string {
      const { context: jobContext, threadId } = context;
      const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
        "summarize",
        threadId
      );
      if (!summarize) return computeSha256("");
      return computeSha256(summaryHashInput(summarize.summary));
    },

    dependencies: ["embed"],

    async execute(
      context: ProcessorExecuteContext
    ): Promise<ProcessorResult<DuplicateProcessorOutput>> {
      const { context: jobContext, run, thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.duplicate",
        processor: "duplicate",
        threadId,
        organizationId: thread.organizationId,
        jobId: jobContext.jobId,
      });
      let status = 200;

      try {
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
            threadId,
            success: false,
            error: "No embedding available from embed processor",
          };
        }

        const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
          "summarize",
          threadId
        );
        const hash = computeSha256(
          summarize ? summaryHashInput(summarize.summary) : ""
        );

        const results = await searchSimilarThreads(embedOutput.embedding, {
          organizationId: thread.organizationId,
          excludeThreadIds: [threadId],
          scoreThreshold: DUPLICATE_THRESHOLD,
          limit: 5,
        });

        const evidence = pickDuplicateEvidence(results, {
          threshold: DUPLICATE_THRESHOLD,
        });

        await run.writeHint("duplicate", evidence, hash);

        requestLog.set({
          search: {
            candidateCount: results.length,
            limit: 5,
            scoreThreshold: DUPLICATE_THRESHOLD,
          },
          outcome: {
            status: "completed",
            duplicateFound: Boolean(evidence),
          },
        });

        return {
          threadId,
          success: true,
          data: { evidence },
        };
      } catch (error) {
        status = 500;
        const message = error instanceof Error ? error.message : String(error);
        requestLog.error(error instanceof Error ? error : String(error), {
          retryable: isRetryableError(error),
          step: "duplicate",
        });
        requestLog.set({ outcome: { status: "failed" } });
        return { threadId, success: false, error: message };
      } finally {
        requestLog.emit({ status });
      }
    },

    getIdempotencyKey(threadId: string): string {
      return `duplicate:${threadId}`;
    },

    name: "duplicate",
  };
