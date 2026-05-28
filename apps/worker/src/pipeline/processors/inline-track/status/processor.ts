import { createAILogger, createLogger } from "@workspace/utils/logging";
import { STATUS_LABELS } from "@workspace/schemas/signals";
import { createHash } from "node:crypto";
import { AI_PRICING } from "../../../../lib/ai-pricing";
import { getStatusAutonomyMode } from "../../../../lib/autonomy";
import { fetchClient } from "../../../../lib/database/client";
import { appendOrReplaceInlineSuggestion } from "../../../../lib/inline-suggestions";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import { type AllowedStatus, inferStatus } from "./infer";

// Below this score the inferer emits nothing.
const SUGGEST_THRESHOLD = 0.5;
// Reserved for auto-mode silent-apply (gated by issue 04). Wrong status flips
// are annoying to undo, so this threshold is intentionally higher than label's.
// biome-ignore lint/correctness/noUnusedVariables: kept for issue 04 wire-up.
const AUTO_THRESHOLD = 0.85;

const RECENT_MESSAGE_WINDOW = 6;

// Statuses the inferer is NOT allowed to suggest. Duplicate is a relational
// claim — it should come from the duplicate generator (issue 05D), not from
// status inference over the latest message.
const NON_SUGGESTABLE_STATUSES = new Set<number>([4]);

export type StatusInfererOutput = {
  skipped?: "autonomy_off" | "no_messages" | "below_threshold";
  status?: number;
  confidence?: number;
};

const allowedStatusesFromTaxonomy = (): AllowedStatus[] =>
  Object.entries(STATUS_LABELS)
    .map(([code, label]) => ({ code: Number(code), label }))
    .filter((s) => !NON_SUGGESTABLE_STATUSES.has(s.code));

const sortedMessages = (
  messages: ProcessorExecuteContext["thread"]["messages"],
): NonNullable<ProcessorExecuteContext["thread"]["messages"]> =>
  [...(messages ?? [])].sort((a, b) => a.id.localeCompare(b.id));

type MessageRole = "customer" | "agent" | "unknown";

// Resolves each message's role:
//   customer = author of the thread
//   agent    = author linked to a teammate (author.userId is set)
//   unknown  = anything else (external author with no teammate link)
async function resolveMessageRoles(
  authorIds: string[],
  threadAuthorId: string | null | undefined,
): Promise<Map<string, MessageRole>> {
  const unique = [...new Set(authorIds.filter(Boolean))];
  const rows = await Promise.all(
    unique.map(
      (id) =>
        fetchClient.query.author.where({ id }).get() as Promise<
          Array<{ id: string; userId: string | null }>
        >,
    ),
  );
  const map = new Map<string, MessageRole>();
  for (const [row] of rows) {
    if (!row) continue;
    if (row.id === threadAuthorId) map.set(row.id, "customer");
    else if (row.userId) map.set(row.id, "agent");
    else map.set(row.id, "unknown");
  }
  return map;
}

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
      const latestId = ordered[ordered.length - 1]?.id ?? "";
      return createHash("sha256")
        .update(`${thread.id}:${latestId}`)
        .digest("hex");
    },

    async execute(
      context: ProcessorExecuteContext,
    ): Promise<ProcessorResult<StatusInfererOutput>> {
      const { thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.status_inferer",
        processor: "status_inferer",
        threadId,
        organizationId: thread.organizationId,
        jobId: context.context.jobId,
      });
      const ai = createAILogger(requestLog, { cost: AI_PRICING });
      let status = 200;

      try {
        const autonomy = await getStatusAutonomyMode(thread.organizationId);
        if (autonomy === "off") {
          return {
            threadId,
            success: true,
            data: { skipped: "autonomy_off" },
          };
        }

        const ordered = sortedMessages(thread.messages);
        if (ordered.length === 0) {
          return {
            threadId,
            success: true,
            data: { skipped: "no_messages" },
          };
        }

        const latestMessage = ordered[ordered.length - 1];
        const windowed = ordered.slice(-RECENT_MESSAGE_WINDOW);
        const roleByAuthorId = await resolveMessageRoles(
          windowed.map((m) => m.authorId),
          thread.authorId,
        );
        const recentMessages = windowed.map((m) => ({
          role: roleByAuthorId.get(m.authorId) ?? "unknown",
          content: m.content,
        }));

        const summarizeOutput =
          context.context.getProcessorOutput<SummarizeOutput>(
            "summarize",
            threadId,
          );

        const allowedStatuses = allowedStatusesFromTaxonomy();

        const { status: inferred, confidence } = await inferStatus(
          {
            threadName: thread.name ?? null,
            latestMessageContent: latestMessage?.content ?? null,
            recentMessages,
            summary: summarizeOutput?.summary ?? null,
            currentStatus: thread.status ?? 0,
            allowedStatuses,
          },
          ai,
        );

        if (inferred === null || confidence < SUGGEST_THRESHOLD) {
          return {
            threadId,
            success: true,
            data: {
              skipped: "below_threshold",
              status: inferred ?? undefined,
              confidence,
            },
          };
        }

        // TODO(issue-04): When the action executor lands, branch on `autonomy`:
        //   autonomy === "auto" && confidence >= AUTO_THRESHOLD
        //     → executeBundle([{kind:"set_status", status: inferred}], handlers, ctx)
        //       and write the autonomousAction receipt; do not emit a suggestion.
        // Until then, both "suggest" and "auto" emit an inline suggestion.
        await appendOrReplaceInlineSuggestion(threadId, {
          id: `status:${threadId}`,
          action: { kind: "set_status", status: inferred },
          confidence,
          generator: "status_inferer",
          createdAt: new Date().toISOString(),
        });

        return {
          threadId,
          success: true,
          data: { status: inferred, confidence },
        };
      } catch (error) {
        status = 500;
        console.error(`Status inferer failed for thread ${threadId}:`, error);
        requestLog.error(
          `Status inferer failed for thread ${threadId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return {
          threadId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
