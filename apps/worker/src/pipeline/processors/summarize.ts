import { createHash } from "node:crypto";
import { summarizeThread } from "../../tools/pre-processors/summary";
import type { ParsedSummary } from "../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../core/types";

/**
 * Output type for the summarize processor
 */
export interface SummarizeOutput {
  summary: ParsedSummary;
}

/**
 * Compute SHA256 hash of input data for idempotency checking
 */
const computeSha256 = (data: string): string => {
  return createHash("sha256").update(data).digest("hex");
};

/**
 * Summarize processor
 *
 * Takes a thread and generates a normalized summary using LLM.
 * Dependencies: none (first in pipeline)
 */
export const summarizeProcessor: ProcessorDefinition<SummarizeOutput> = {
  name: "summarize",

  dependencies: [],

  getIdempotencyKey(threadId: string): string {
    return `summarize:${threadId}`;
  },

  computeHash(context: ProcessorExecuteContext): string {
    const { thread } = context;

    const firstMessage = thread.messages?.sort((a, b) =>
      a.id.localeCompare(b.id),
    )[0];

    const labelNames = thread.labels
      ?.filter((l) => l.label?.enabled)
      .map((l) => l.label?.name)
      .filter(Boolean)
      .sort()
      .join(",");

    const hashInput = [
      thread.name || "",
      firstMessage?.content || "",
      labelNames || "",
    ].join("|");

    return computeSha256(hashInput);
  },

  async execute(
    context: ProcessorExecuteContext,
  ): Promise<ProcessorResult<SummarizeOutput>> {
    const { thread, threadId } = context;

    try {
      const summary = await summarizeThread(thread);

      if (!summary || !summary.title || summary.title.trim().length === 0) {
        return {
          threadId,
          success: false,
          error: "Failed to generate summary: empty result",
        };
      }

      return {
        threadId,
        success: true,
        data: { summary },
      };
    } catch (error) {
      console.error(
        `Summarize processor failed for thread ${threadId}:`,
        error,
      );
      return {
        threadId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
