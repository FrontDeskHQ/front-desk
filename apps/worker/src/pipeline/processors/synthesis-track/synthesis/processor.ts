import { createHash } from "node:crypto";
import type { Hints, ThreadRead } from "@workspace/schemas/signals";
import { createAILogger, createLogger } from "@workspace/utils/logging";
import { AI_PRICING } from "../../../../lib/ai-pricing";
import { applySynthesisAutonomy } from "../../../../lib/apply-synthesis-autonomy";
import {
  resolveMessageRoles,
  threadHasTeamReply,
} from "../../../../lib/message-roles";
import { readHintBag } from "../../../../lib/read-hints";
import type { ParsedSummary } from "../../../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import type { DuplicateProcessorOutput } from "../duplicate/processor";
import type { RelatedDocsProcessorOutput } from "../related_docs/processor";
import { normalizeSynthesisRawActionSet } from "./normalize";
import { synthesizeThreadRead } from "./synthesize";
import { createSynthesisTools } from "./tools";

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

const messageTimestamp = (createdAt: unknown): number => {
  const time = new Date(createdAt as string | number | Date).getTime();
  return Number.isNaN(time) ? 0 : time;
};

// Order by `createdAt` (with `id` as a stable tie-breaker) so the last element
// is the true newest message. Sorting by `id` alone is wrong for Slack/Discord
// backfills, where ids are ULIDs at insert time but `createdAt` reflects the
// original external timestamp.
const sortedMessages = (
  messages: ProcessorExecuteContext["thread"]["messages"],
): NonNullable<ProcessorExecuteContext["thread"]["messages"]> =>
  [...(messages ?? [])].sort((a, b) => {
    const delta = messageTimestamp(a.createdAt) - messageTimestamp(b.createdAt);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });

const sortedAppliedLabelIds = (
  thread: ProcessorExecuteContext["thread"],
): string[] =>
  (thread.labels ?? [])
    .filter((threadLabel) => threadLabel.enabled && threadLabel.label?.enabled)
    .map((threadLabel) => threadLabel.labelId)
    .sort();

const summaryHashInput = (summary: ParsedSummary): string =>
  Object.entries(summary)
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
    .join("|");

export type SynthesisProcessorOutput = {
  rawActionSet: ThreadRead | null;
  agentRead: ThreadRead | null;
};

export const synthesisProcessor: ProcessorDefinition<SynthesisProcessorOutput> =
  {
    name: "synthesis",

    dependencies: ["summarize", "duplicate", "related_docs"],

    getIdempotencyKey(threadId: string): string {
      return `synthesis:${threadId}`;
    },

    computeHash(context: ProcessorExecuteContext): string {
      const { context: jobContext, thread, threadId } = context;
      const messages = sortedMessages(thread.messages);
      const latestMessage = messages[messages.length - 1];
      const appliedLabels = sortedAppliedLabelIds(thread);

      const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
        "summarize",
        threadId,
      );
      const duplicate = jobContext.getProcessorOutput<DuplicateProcessorOutput>(
        "duplicate",
        threadId,
      );
      const relatedDocs =
        jobContext.getProcessorOutput<RelatedDocsProcessorOutput>(
          "related_docs",
          threadId,
        );

      const hashInput = [
        thread.id,
        thread.name ?? "",
        latestMessage?.id ?? "",
        latestMessage?.content ?? "",
        appliedLabels.join(","),
        summarize?.summary ? summaryHashInput(summarize.summary) : "",
        JSON.stringify(duplicate?.evidence ?? null),
        JSON.stringify(relatedDocs?.evidence ?? null),
      ].join("|");

      return computeSha256(hashInput);
    },

    async execute(
      context: ProcessorExecuteContext,
    ): Promise<ProcessorResult<SynthesisProcessorOutput>> {
      const { context: jobContext, thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.synthesis",
        processor: "synthesis",
        threadId,
        organizationId: thread.organizationId,
        jobId: jobContext.jobId,
      });
      const ai = createAILogger(requestLog, { cost: AI_PRICING });
      let status = 200;

      try {
        const messages = sortedMessages(thread.messages);
        const latestMessage = messages[messages.length - 1];

        if (!latestMessage) {
          await applySynthesisAutonomy(threadId, thread.organizationId, null);
          return {
            threadId,
            success: true,
            data: { rawActionSet: null, agentRead: null },
          };
        }

        const hints: Hints = await readHintBag(threadId);
        const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
          "summarize",
          threadId,
        );

        const messageRoles = await resolveMessageRoles(
          messages.map((message) => message.authorId),
          thread.authorId,
        );
        const hasTeamReply = threadHasTeamReply(messages, messageRoles);

        const tools = createSynthesisTools({
          organizationId: thread.organizationId,
          currentThreadId: threadId,
          currentThread: thread,
        });

        const output = await synthesizeThreadRead(
          {
            threadId,
            threadName: thread.name ?? null,
            sourceInputMessageId: latestMessage.id,
            threadMessages: messages.map((message) => ({
              id: message.id,
              content: message.content,
              authorId: message.authorId,
              createdAt:
                message.createdAt instanceof Date
                  ? message.createdAt.toISOString()
                  : String(message.createdAt),
            })),
            summary: summarize?.summary ?? null,
            hints,
            hasTeamReply,
          },
          tools,
          ai,
        );

        const rawActionSet = normalizeSynthesisRawActionSet({
          output,
          messageIds: new Set(messages.map((message) => message.id)),
          fallbackSourceInputMessageId: latestMessage.id,
          hasTeamReply,
        });

        const agentRead = await applySynthesisAutonomy(
          threadId,
          thread.organizationId,
          rawActionSet,
        );

        return {
          threadId,
          success: true,
          data: { rawActionSet, agentRead },
        };
      } catch (error) {
        status = 500;
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `Synthesis processor failed for thread ${threadId}:`,
          error,
        );
        requestLog.error(`Synthesis failed for thread ${threadId}: ${message}`);
        return { threadId, success: false, error: message };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
