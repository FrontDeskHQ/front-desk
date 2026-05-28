import { createHash } from "node:crypto";
import type { RelatedDocsEvidence } from "@workspace/schemas/signals";
import { createLogger } from "@workspace/utils/logging";
import { searchDocumentation } from "../../../../lib/qdrant/search-documentation";
import { writeHintSlot } from "../../../../lib/read-hints";
import type { ParsedSummary } from "../../../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import { toRelatedDocsEvidence } from "./find";

export type RelatedDocsProcessorOutput = {
  evidence: RelatedDocsEvidence | null;
};

const summaryHashInput = (summary: ParsedSummary): string =>
  Object.entries(summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .trim();

const buildSearchQuery = (summary: ParsedSummary): string => {
  const parts = [
    summary.title,
    summary.shortDescription,
    ...(summary.keywords ?? []),
  ].filter((part) => typeof part === "string" && part.trim().length > 0);
  return parts.join("\n").trim();
};

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

export const relatedDocsProcessor: ProcessorDefinition<RelatedDocsProcessorOutput> =
  {
    name: "related_docs",

    dependencies: ["embed"],

    getIdempotencyKey(threadId: string): string {
      return `related_docs:${threadId}`;
    },

    computeHash(context: ProcessorExecuteContext): string {
      const { context: jobContext, threadId } = context;
      const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
        "summarize",
        threadId,
      );
      if (!summarize) return computeSha256("");
      return computeSha256(summaryHashInput(summarize.summary));
    },

    async execute(
      context: ProcessorExecuteContext,
    ): Promise<ProcessorResult<RelatedDocsProcessorOutput>> {
      const { context: jobContext, thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.related_docs",
        processor: "related_docs",
        threadId,
        organizationId: thread.organizationId,
        jobId: jobContext.jobId,
      });
      let status = 200;

      try {
        const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
          "summarize",
          threadId,
        );
        const hash = computeSha256(
          summarize ? summaryHashInput(summarize.summary) : "",
        );

        const query = summarize ? buildSearchQuery(summarize.summary) : "";
        const hits =
          query.length > 0
            ? await searchDocumentation({
                query,
                organizationId: thread.organizationId,
              })
            : [];

        const evidence: RelatedDocsEvidence | null =
          toRelatedDocsEvidence(hits);

        await writeHintSlot(threadId, "related_docs", evidence, hash);

        return {
          threadId,
          success: true,
          data: { evidence },
        };
      } catch (error) {
        status = 500;
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `Related docs processor failed for thread ${threadId}:`,
          error,
        );
        requestLog.error(
          `Related docs failed for thread ${threadId}: ${message}`,
        );
        return { threadId, success: false, error: message };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
