import { createHash } from "node:crypto";

import { threadHasTeamReply } from "@workspace/schemas/message-roles";
import { sortThreadReadTriggers } from "@workspace/schemas/signals";
import type { Hints, ThreadRead } from "@workspace/schemas/signals";
import { createAILogger, createLogger } from "@workspace/utils/logging";

import { AI_PRICING } from "../../../../lib/ai-pricing";
import { isRetryableError } from "../../../../lib/logging";
import { sortMessagesByTime } from "../../../../lib/message-order";
import type { ParsedSummary } from "../../../../types";
import { applySynthesisAutonomy } from "../../../core/autonomy-stage";
import { hasSynthesisTrigger } from "../../../core/trigger-policy";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import type { RetrievalHintOutput } from "../define-retrieval-hint";
import { normalizeSynthesisRawActionSet } from "./normalize";
import {
  enabledSynthesisActionKinds,
  synthesizeThreadRead,
} from "./synthesize";
import { createSynthesisTools } from "./tools";

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

const sortedMessages = (
  messages: ProcessorExecuteContext["thread"]["messages"]
): NonNullable<ProcessorExecuteContext["thread"]["messages"]> =>
  sortMessagesByTime(messages);

const sortedAppliedLabelIds = (
  thread: ProcessorExecuteContext["thread"]
): string[] =>
  (thread.labels ?? [])
    .filter((threadLabel) => threadLabel.enabled && threadLabel.label?.enabled)
    .map((threadLabel) => threadLabel.labelId)
    .sort();

const summaryHashInput = (summary: ParsedSummary): string =>
  Object.entries(summary)
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
    .join("|");

export interface SynthesisProcessorOutput {
  rawActionSet: ThreadRead | null;
  agentRead: ThreadRead | null;
}

export const synthesisProcessor: ProcessorDefinition<SynthesisProcessorOutput> =
  {
    computeHash(context: ProcessorExecuteContext): string {
      const { context: jobContext, thread, threadId } = context;
      const messages = sortedMessages(thread.messages);
      const latestMessage = messages.at(-1);
      const appliedLabels = sortedAppliedLabelIds(thread);

      const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
        "summarize",
        threadId
      );
      const duplicate = jobContext.getProcessorOutput<
        RetrievalHintOutput<"duplicate">
      >("duplicate", threadId);
      const relatedDocs = jobContext.getProcessorOutput<
        RetrievalHintOutput<"related_docs">
      >("related_docs", threadId);
      const relatedPrs = jobContext.getProcessorOutput<
        RetrievalHintOutput<"related_prs">
      >("related_prs", threadId);
      const relatedIssues = jobContext.getProcessorOutput<
        RetrievalHintOutput<"related_issues">
      >("related_issues", threadId);

      const hashInput = [
        thread.id,
        thread.name ?? "",
        // Shapes availability (an already-linked thread cannot file an issue),
        // so it is a real synthesis input.
        thread.externalIssueId ?? "",
        // Every message's role is derived from the thread author (customer) and
        // from whether an author is linked to a teammate, so reassigning the
        // thread author re-labels the transcript and can invalidate a
        // `customer_confirmed` witness without changing a single message.
        // TODO(role-revision): the other half of the derivation —
        // `author.userId` being linked after the fact, which turns `unknown`
        // into `agent` — is an async lookup this sync hash cannot do. It needs a
        // role revision stamped on the thread to be hashable here.
        thread.authorId ?? "",
        latestMessage?.id ?? "",
        latestMessage?.content ?? "",
        appliedLabels.join(","),
        summarize?.summary ? summaryHashInput(summarize.summary) : "",
        JSON.stringify(duplicate?.evidence ?? null),
        JSON.stringify(relatedDocs?.evidence ?? null),
        JSON.stringify(relatedPrs?.evidence ?? null),
        JSON.stringify(relatedIssues?.evidence ?? null),
        // Trigger channel (ADR 0006): a pushed PR candidate must re-run
        // synthesis even when thread content is unchanged.
        JSON.stringify(sortThreadReadTriggers(jobContext.input.triggers ?? [])),
      ].join("|");

      return computeSha256(hashInput);
    },

    dependencies: [
      "summarize",
      "duplicate",
      "related_docs",
      "related_prs",
      "related_issues",
    ],

    // Linking/unlinking sets `externalIssueId` without changing summarize or
    // related_* outputs, so those deps can all skip. Without this opt-out the
    // orchestrator would fast-path synthesis on idempotency-key existence alone
    // and never consult the hash that now includes `externalIssueId` — leaving
    // a stale create_issue offer (or hiding a newly available one). Always
    // return true so both directions (link and unlink) hit the hash check;
    // related_issues / related_prs only care about the linked state.
    runsWhenDependenciesSkipped(_context: ProcessorExecuteContext): boolean {
      return true;
    },

    runsOnTrigger(context: ProcessorExecuteContext): boolean {
      return hasSynthesisTrigger(context.context.input.triggers);
    },

    async execute(
      context: ProcessorExecuteContext
    ): Promise<ProcessorResult<SynthesisProcessorOutput>> {
      const { context: jobContext, run, thread, threadId } = context;
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
        const latestMessage = messages.at(-1);

        if (!latestMessage) {
          await applySynthesisAutonomy(run, null);
          requestLog.set({
            outcome: { status: "completed", reason: "no_messages" },
          });
          return {
            threadId,
            success: true,
            data: { rawActionSet: null, agentRead: null },
          };
        }

        // Slots persisted by earlier runs, merged with the ones this run's hint
        // processors wrote in the previous turn — no re-fetch needed.
        const hints: Hints = run.hints();
        const summarize = jobContext.getProcessorOutput<SummarizeOutput>(
          "summarize",
          threadId
        );

        const resolvedAuthors = await run.authors();
        const hasTeamReply = threadHasTeamReply(
          messages,
          resolvedAuthors.roles
        );
        const customerName = thread.authorId
          ? (resolvedAuthors.names.get(thread.authorId) ?? null)
          : null;

        // Availability and autonomy are resolved *before* synthesis so they
        // shape the prompt and output contract. The autonomy stage repeats the
        // policy check afterward as defense in depth.
        const availability = await run.availability();
        const autonomy = await run.autonomy();
        const enabledActionKinds = enabledSynthesisActionKinds({
          autonomy,
          availability,
        });

        if (enabledActionKinds.size === 0) {
          await applySynthesisAutonomy(run, null);
          requestLog.set({
            synthesis: {
              createIssueAvailable: availability.create_issue,
              enabledActionCount: 0,
              hintCount: Object.keys(hints).length,
              messageCount: messages.length,
              teamReplyPresent: hasTeamReply,
            },
            outcome: { status: "completed", reason: "all_actions_off" },
          });
          return {
            threadId,
            success: true,
            data: { rawActionSet: null, agentRead: null },
          };
        }

        const tools = createSynthesisTools({
          audit: run.audit,
          organizationId: thread.organizationId,
          currentThreadId: threadId,
          currentThread: thread,
        });

        const output = await synthesizeThreadRead(
          {
            threadId,
            threadName: thread.name ?? null,
            customerName,
            sourceInputMessageId: latestMessage.id,
            threadMessages: messages.map((message) => ({
              id: message.id,
              content: message.content,
              authorId: message.authorId,
              role: resolvedAuthors.roles.get(message.authorId) ?? "unknown",
              createdAt:
                message.createdAt instanceof Date
                  ? message.createdAt.toISOString()
                  : String(message.createdAt),
            })),
            availability,
            autonomy,
            summary: summarize?.summary ?? null,
            hints,
            triggers: jobContext.input.triggers ?? [],
            hasTeamReply,
          },
          tools,
          ai,
          requestLog,
          run.audit
        );

        const rawActionSet = normalizeSynthesisRawActionSet({
          output,
          messageIds: new Set(messages.map((message) => message.id)),
          customerMessageIds: new Set(
            messages
              .filter(
                (message) =>
                  resolvedAuthors.roles.get(message.authorId) === "customer"
              )
              .map((message) => message.id)
          ),
          fallbackSourceInputMessageId: latestMessage.id,
          hasTeamReply,
          replyEnabled: enabledActionKinds.has("reply"),
        });

        const agentRead = await applySynthesisAutonomy(run, rawActionSet);

        requestLog.set({
          synthesis: {
            messageCount: messages.length,
            hintCount: Object.keys(hints).length,
            createIssueAvailable: availability.create_issue,
            primaryActionCount: rawActionSet?.primary.length ?? 0,
            alternativeActionCount: rawActionSet?.alternatives?.length ?? 0,
            teamReplyPresent: hasTeamReply,
          },
          outcome: {
            status: "completed",
            agentReadPresent: Boolean(agentRead),
          },
        });

        return {
          threadId,
          success: true,
          data: { rawActionSet, agentRead },
        };
      } catch (error) {
        status = 500;
        const retryable = isRetryableError(error);
        const message = error instanceof Error ? error.message : String(error);
        requestLog.error(error instanceof Error ? error : String(error), {
          retryable,
          step: "synthesis",
        });
        requestLog.set({ outcome: { status: "failed" } });
        if (retryable) {
          throw error;
        }
        return { threadId, success: false, error: message };
      } finally {
        requestLog.emit({ status });
      }
    },

    getIdempotencyKey(threadId: string): string {
      return `synthesis:${threadId}`;
    },

    name: "synthesis",
  };
