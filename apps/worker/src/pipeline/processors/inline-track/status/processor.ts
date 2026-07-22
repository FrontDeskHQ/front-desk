import { createHash } from "node:crypto";

import { STATUS_LABELS } from "@workspace/schemas/signals";
import { createAILogger, createLogger } from "@workspace/utils/logging";

import { AI_PRICING } from "../../../../lib/ai-pricing";
import { getStatusAutonomyMode } from "../../../../lib/autonomy";
import { appendOrReplaceInlineSuggestion } from "../../../../lib/inline-suggestions";
import { resolveMessageRoles } from "../../../../lib/message-roles";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import { inferStatus } from "./infer";
import type { AllowedStatus } from "./infer";

// Below this score the inferer emits nothing.
const SUGGEST_THRESHOLD = 0.5;
// Reserved for auto-mode silent-apply (gated by issue 04). Wrong status flips
// are annoying to undo, so this threshold is intentionally higher than label's.
const _AUTO_THRESHOLD = 0.85;

const RECENT_MESSAGE_WINDOW = 6;

// Statuses the inferer is NOT allowed to suggest. Duplicate is a relational
// claim — it should come from the duplicate generator (issue 05D), not from
// status inference over the latest message.
const NON_SUGGESTABLE_STATUSES = new Set<number>([4]);

export interface StatusInfererOutput {
  skipped?: "autonomy_off" | "no_messages" | "below_threshold";
  status?: number;
  confidence?: number;
}

const allowedStatusesFromTaxonomy = (): AllowedStatus[] =>
  Object.entries(STATUS_LABELS)
    .map(([code, label]) => ({ code: Number(code), label }))
    .filter((s) => !NON_SUGGESTABLE_STATUSES.has(s.code));

const sortedMessages = (
  messages: ProcessorExecuteContext["thread"]["messages"]
): NonNullable<ProcessorExecuteContext["thread"]["messages"]> =>
  [...(messages ?? [])].toSorted((a, b) => a.id.localeCompare(b.id));

export const statusInfererProcessor: ProcessorDefinition<StatusInfererOutput> =
  {
    name: "status_inferer",

    dependencies: ["summarize"],

    getIdempotencyKey(threadId: string): string {
      return `status_inferer:${threadId}`;
    },

    // Re-fires on every new message: hash includes the latest message id.
    // Falls back to the thread id alone if no messages exist (executor will
    // then short-circuit on the no_messages skip).
    computeHash(context: ProcessorExecuteContext): string {
      const { thread } = context;
      const ordered = sortedMessages(thread.messages);
      const latestId = ordered.at(-1)?.id ?? "";
      return createHash("sha256")
        .update(`${thread.id}:${latestId}`)
        .digest("hex");
    },

    async execute(
      context: ProcessorExecuteContext
    ): Promise<ProcessorResult<StatusInfererOutput>> {
      const { thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.status_inferer",
        jobId: context.context.jobId,
        organizationId: thread.organizationId,
        processor: "status_inferer",
        threadId,
      });
      const ai = createAILogger(requestLog, { cost: AI_PRICING });
      let status = 200;

      try {
        const autonomy = await getStatusAutonomyMode(thread.organizationId);
        if (autonomy === "off") {
          return {
            data: { skipped: "autonomy_off" },
            success: true,
            threadId,
          };
        }

        const ordered = sortedMessages(thread.messages);
        if (ordered.length === 0) {
          return {
            data: { skipped: "no_messages" },
            success: true,
            threadId,
          };
        }

        const latestMessage = ordered.at(-1);
        const windowed = ordered.slice(-RECENT_MESSAGE_WINDOW);
        const roleByAuthorId = await resolveMessageRoles(
          windowed.map((m) => m.authorId),
          thread.authorId
        );
        const recentMessages = windowed.map((m) => ({
          content: m.content,
          role: roleByAuthorId.get(m.authorId) ?? "unknown",
        }));

        const summarizeOutput =
          context.context.getProcessorOutput<SummarizeOutput>(
            "summarize",
            threadId
          );

        const allowedStatuses = allowedStatusesFromTaxonomy();

        const { status: inferred, confidence } = await inferStatus(
          {
            allowedStatuses,
            currentStatus: thread.status ?? 0,
            latestMessageContent: latestMessage?.content ?? null,
            recentMessages,
            summary: summarizeOutput?.summary ?? null,
            threadName: thread.name ?? null,
          },
          ai
        );

        if (inferred === null || confidence < SUGGEST_THRESHOLD) {
          return {
            data: {
              confidence,
              skipped: "below_threshold",
              status: inferred ?? undefined,
            },
            success: true,
            threadId,
          };
        }

        // TODO(issue-04): When the action executor lands, branch on `autonomy`:
        //   autonomy === "auto" && confidence >= AUTO_THRESHOLD
        //     → executeBundle([{kind:"set_status", status: inferred}], handlers, ctx)
        //       and write the autonomousAction receipt; do not emit a suggestion.
        // Until then, both "suggest" and "auto" emit an inline suggestion.
        await appendOrReplaceInlineSuggestion(threadId, thread.organizationId, {
          action: { kind: "set_status", status: inferred },
          confidence,
          createdAt: new Date().toISOString(),
          generator: "status_inferer",
          id: `status:${threadId}`,
        });

        return {
          data: { confidence, status: inferred },
          success: true,
          threadId,
        };
      } catch (error) {
        status = 500;
        console.error(`Status inferer failed for thread ${threadId}:`, error);
        requestLog.error(
          `Status inferer failed for thread ${threadId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          error: error instanceof Error ? error.message : String(error),
          success: false,
          threadId,
        };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
