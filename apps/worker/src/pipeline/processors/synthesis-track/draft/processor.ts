import { createHash } from "node:crypto";
import type { ReplyAction } from "@workspace/schemas/signals";
import { createAILogger, createLogger } from "@workspace/utils/logging";
import { AI_PRICING } from "../../../../lib/ai-pricing";
import { fetchClient } from "../../../../lib/database/client";
import { writeSynthesisCandidateSlot } from "../../../../lib/synthesis-candidates";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import { draftReply } from "./draft";

export type DraftProcessorOutput = {
  candidate: ReplyAction | null;
};

// How many trailing messages to feed the drafter as conversational context.
const RECENT_MESSAGE_WINDOW = 6;

const sortedMessages = (
  messages: ProcessorExecuteContext["thread"]["messages"],
): NonNullable<ProcessorExecuteContext["thread"]["messages"]> =>
  [...(messages ?? [])].sort((a, b) => a.id.localeCompare(b.id));

const sortedAppliedLabelIds = (
  thread: ProcessorExecuteContext["thread"],
): string[] =>
  (thread.labels ?? [])
    .filter((tl) => tl.enabled && tl.label?.enabled)
    .map((tl) => tl.labelId)
    .sort();

const appliedLabelNames = (
  thread: ProcessorExecuteContext["thread"],
): string[] =>
  (thread.labels ?? [])
    .filter((tl) => tl.enabled && tl.label?.enabled)
    .map((tl) => tl.label?.name)
    .filter((name): name is string => Boolean(name));

// Latest-message + applied-labels fingerprint. See computeHash docs below.
const computeDraftHash = (
  thread: ProcessorExecuteContext["thread"],
): string => {
  const ordered = sortedMessages(thread.messages);
  const latest = ordered[ordered.length - 1];
  const labels = sortedAppliedLabelIds(thread).join(",");
  return createHash("sha256")
    .update(`${latest?.id ?? ""}:${latest?.content ?? ""}|${labels}`)
    .digest("hex");
};

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

async function getCustomInstructions(
  organizationId: string,
): Promise<string | null> {
  const rows = (await fetchClient.query.organization
    .where({ id: organizationId })
    .get()) as Array<{ customInstructions: string | null }>;
  return rows[0]?.customInstructions ?? null;
}

export const draftProcessor: ProcessorDefinition<DraftProcessorOutput> = {
  name: "draft",

  dependencies: ["summarize"],

  getIdempotencyKey(threadId: string): string {
    return `draft:${threadId}`;
  },

  // Re-fires when the latest message changes (new inbound, or an edit to the
  // most recent message) or when applied labels change. Typo edits to *older*
  // messages leave the latest message untouched, so the hash holds steady.
  //
  // TODO(05E): include the org's customInstructions revision once org metadata
  // is available synchronously in computeHash, so a voice/policy change forces a
  // re-draft. Today computeHash only sees in-memory thread/jobContext data, and
  // customInstructions is an async org-level fetch (used in execute below for
  // the prompt, but it does not move the hash).
  computeHash(context: ProcessorExecuteContext): string {
    return computeDraftHash(context.thread);
  },

  async execute(
    context: ProcessorExecuteContext,
  ): Promise<ProcessorResult<DraftProcessorOutput>> {
    const { context: jobContext, thread, threadId } = context;
    const requestLog = createLogger({
      action: "pipeline.draft",
      processor: "draft",
      threadId,
      organizationId: thread.organizationId,
      jobId: jobContext.jobId,
    });
    const ai = createAILogger(requestLog, { cost: AI_PRICING });
    let status = 200;

    try {
      const ordered = sortedMessages(thread.messages);
      const hash = computeDraftHash(thread);

      const writeNull = async () => {
        await writeSynthesisCandidateSlot(threadId, "draft", {
          candidate: null,
          hash,
        });
        return {
          threadId,
          success: true as const,
          data: { candidate: null },
        };
      };

      if (ordered.length === 0) {
        return await writeNull();
      }

      // Determine the role of the most recent message. If the support team
      // already replied last, there is nothing new to draft.
      const windowed = ordered.slice(-RECENT_MESSAGE_WINDOW);
      const roleByAuthorId = await resolveMessageRoles(
        windowed.map((m) => m.authorId),
        thread.authorId,
      );
      const latest = windowed[windowed.length - 1];
      if (!latest) {
        return await writeNull();
      }
      const latestRole = roleByAuthorId.get(latest.authorId) ?? "unknown";
      if (latestRole === "agent") {
        return await writeNull();
      }

      const summarizeOutput = jobContext.getProcessorOutput<SummarizeOutput>(
        "summarize",
        threadId,
      );
      const customInstructions = await getCustomInstructions(
        thread.organizationId,
      );

      const { draftMarkdown } = await draftReply(
        {
          threadName: thread.name ?? null,
          recentMessages: windowed.map((m) => ({
            role: roleByAuthorId.get(m.authorId) ?? "unknown",
            content: m.content,
          })),
          summary: summarizeOutput?.summary ?? null,
          appliedLabels: appliedLabelNames(thread),
          customInstructions,
        },
        ai,
      );

      const candidate: ReplyAction | null = draftMarkdown
        ? { kind: "reply", draftMarkdown }
        : null;

      await writeSynthesisCandidateSlot(threadId, "draft", {
        candidate,
        hash,
      });

      return {
        threadId,
        success: true,
        data: { candidate },
      };
    } catch (error) {
      status = 500;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Draft processor failed for thread ${threadId}:`, error);
      requestLog.error(`Draft failed for thread ${threadId}: ${message}`);
      return { threadId, success: false, error: message };
    } finally {
      requestLog.emit({ status });
    }
  },
};
