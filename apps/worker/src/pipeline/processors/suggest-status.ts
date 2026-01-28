import { google } from "@ai-sdk/google";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { generateText, Output } from "ai";
import { createHash } from "node:crypto";
import { ulid } from "ulid";
import z from "zod";
import { fetchClient } from "../../lib/database/client";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../core/types";

const SUGGESTION_TYPE_STATUS = "status";

/**
 * Status values for threads
 * 0 = Open: New/awaiting triage
 * 1 = In Progress: Being actively worked on
 * 2 = Resolved: Solution provided, awaiting confirmation
 * 3 = Closed: Completed/no further action needed
 * 4 = Duplicated: Duplicate of another thread
 */
const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "In Progress",
  2: "Resolved",
  3: "Closed",
  4: "Duplicated",
};

const VALID_STATUSES = new Set([0, 1, 2, 3, 4]);

export interface SuggestStatusOutput {
  suggestedStatus: number | null;
  confidence: number;
  reasoning: string;
  cached: boolean;
}

type SuggestionRow = {
  id: string;
  type: string;
  entityId: string;
  relatedEntityId: string | null;
  active: boolean;
  accepted: boolean;
  organizationId: string;
  resultsStr: string | null;
  metadataStr: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const computeSha256 = (data: string): string => {
  return createHash("sha256").update(data).digest("hex");
};

const STATUS_PROMPT = `You are a support ticket status analyzer. Your task is to suggest a status change
ONLY when the conversation clearly warrants it.

CRITICAL RULES:
1. NEVER suggest the current status
2. Default to suggesting NO CHANGE unless there's strong evidence
3. Be conservative - false positives are worse than false negatives
4. Consider the FULL conversation, not just the last message

STATUS DEFINITIONS:
- Open (0): Thread needs attention. Use when: new issue, customer responded with more info,
  previous resolution failed
- In Progress (1): Agent is actively working. Use when: agent acknowledges and is investigating
- Resolved (2): Solution provided, awaiting confirmation. Use when: agent provided a fix/answer
  and is waiting for customer to confirm, or customer explicitly confirms resolution
- Closed (3): No further action needed. Use when: thread is abandoned (no response after resolution),
  or thread is closed without a resolution (e.g., "this is not planned", "the issue was just my internet connection")

COMMON TRAPS TO AVOID:
- Don't mark as Resolved just because agent replied - they must provide an actual solution
- Don't mark as Closed without customer confirmation or clear abandonment
- Don't suggest In Progress just because the thread exists
- A question from the customer doesn't mean "Open" if already being handled
- "Thank you" from customer usually means Close, but verify context

WHEN TO SUGGEST NO CHANGE:
- The conversation is ongoing and status reflects current state
- Not enough information to determine appropriate status
- Edge cases where you're uncertain

REASONING FORMAT:
- Write reasoning as a user-friendly explanation that will be shown to support agents
- Use status names (Open, In Progress, Resolved, Closed) instead of numeric codes
- Reference the thread by its title or as "this thread", never by ID
- Be concise but informative - explain WHY the status change makes sense
- Example: "The customer confirmed the solution works, so this thread can be marked as Closed."
- Avoid technical jargon, internal codes, or implementation details`;

const generateStatusSuggestion = async (
  thread: ProcessorExecuteContext["thread"],
  currentStatus: number,
): Promise<{
  suggestedStatus: number | null;
  confidence: number;
  reasoning: string;
}> => {
  const messages = thread.messages ?? [];

  if (messages.length === 0) {
    return {
      suggestedStatus: null,
      confidence: 0,
      reasoning: "No messages in thread",
    };
  }

  const messageContents = messages
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => jsonContentToPlainText(safeParseJSON(m.content)))
    .filter((text) => text.trim().length > 0);

  if (messageContents.length === 0) {
    return {
      suggestedStatus: null,
      confidence: 0,
      reasoning: "No message content to analyze",
    };
  }

  const threadContent = [
    `Thread Title: ${thread.name}`,
    `Current Status: ${STATUS_LABELS[currentStatus] ?? "Unknown"} (${currentStatus})`,
    "",
    "Messages (in chronological order):",
    ...messageContents.map((content, i) => `${i + 1}. ${content}`),
  ].join("\n");

  const availableStatuses = Object.entries(STATUS_LABELS)
    .filter(([status]) => Number(status) !== currentStatus)
    .map(([status, label]) => `- ${label} (${status})`)
    .join("\n");

  const { output: aiResult } = await generateText({
    model: google("gemini-3-flash-preview"),
    output: Output.object({
      schema: z.object({
        suggestedStatus: z
          .number()
          .nullable()
          .describe(
            "The suggested status number (0-4), or null if no change is recommended",
          ),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe("Confidence score from 0 to 1"),
        reasoning: z
          .string()
          .describe(
            "User-friendly explanation using status names (not numbers) and thread title (not IDs). Example: 'The customer confirmed the fix works, so this thread can be marked as Closed.'",
          ),
      }),
    }),
    prompt: `${STATUS_PROMPT}

${threadContent}

IMPORTANT: The current status is "${STATUS_LABELS[currentStatus]}" (${currentStatus}).
You MUST NOT suggest this status. If you believe the current status is correct, return null for suggestedStatus.

Available statuses to suggest (excluding current):
${availableStatuses}

Analyze the conversation and determine if a status change is warranted.
Return null for suggestedStatus if no change is recommended.`,
  });

  // Validate the returned status
  if (aiResult.suggestedStatus !== null) {
    // Check if it's a valid status
    if (!VALID_STATUSES.has(aiResult.suggestedStatus)) {
      return {
        suggestedStatus: null,
        confidence: 0,
        reasoning: `Invalid status suggested by LLM: ${aiResult.suggestedStatus}`,
      };
    }

    // Double-check it's not the current status
    if (aiResult.suggestedStatus === currentStatus) {
      return {
        suggestedStatus: null,
        confidence: aiResult.confidence,
        reasoning: "LLM suggested current status; treating as no change needed",
      };
    }
  }

  if (aiResult.confidence < 0.5) {
    return {
      suggestedStatus: null,
      confidence: aiResult.confidence,
      reasoning: "Low confidence in suggested status",
    };
  }

  return {
    suggestedStatus: aiResult.suggestedStatus,
    confidence: aiResult.confidence,
    reasoning: aiResult.reasoning,
  };
};

export const suggestStatusProcessor: ProcessorDefinition<SuggestStatusOutput> =
  {
    name: "suggest-status",

    dependencies: [],

    getIdempotencyKey(threadId: string): string {
      return `suggest-status:${threadId}`;
    },

    computeHash(context: ProcessorExecuteContext): string {
      const { thread } = context;

      const messages = thread.messages ?? [];
      const messageContents = messages
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((m) => jsonContentToPlainText(safeParseJSON(m.content)))
        .filter((text) => text.trim().length > 0)
        .slice(0, 10)
        .join("|");

      // Include current status in hash so we reprocess if status changes
      const hashInput = [
        thread.id,
        thread.name || "",
        String(thread.status ?? 0),
        messageContents,
      ].join("|");

      return computeSha256(hashInput);
    },

    async execute(
      context: ProcessorExecuteContext,
    ): Promise<ProcessorResult<SuggestStatusOutput>> {
      const { thread, threadId } = context;
      const organizationId = thread.organizationId;
      const currentStatus = thread.status ?? 0;

      try {
        console.log(
          `Suggesting status for thread ${threadId} (current: ${STATUS_LABELS[currentStatus]})`,
        );

        const { suggestedStatus, confidence, reasoning } =
          await generateStatusSuggestion(thread, currentStatus);

        // Get existing status suggestion for this thread
        const existingSuggestions = (await fetchClient.query.suggestion
          .where({
            type: SUGGESTION_TYPE_STATUS,
            entityId: threadId,
            organizationId,
          })
          .get()) as SuggestionRow[];

        const now = new Date();

        if (suggestedStatus !== null) {
          // We have a suggestion to store
          const existingSuggestion = existingSuggestions[0];
          const resultsStr = JSON.stringify({ suggestedStatus });
          const metadataStr = JSON.stringify({
            confidence,
            reasoning,
            currentStatus,
          });

          if (existingSuggestion) {
            // Update existing suggestion
            await fetchClient.mutate.suggestion.update(existingSuggestion.id, {
              active: existingSuggestion.active,
              accepted: existingSuggestion.accepted,
              resultsStr,
              metadataStr,
              updatedAt: now,
            });
          } else {
            // Create new suggestion
            await fetchClient.mutate.suggestion.insert({
              id: ulid().toLowerCase(),
              type: SUGGESTION_TYPE_STATUS,
              entityId: threadId,
              relatedEntityId: null,
              organizationId,
              active: true,
              accepted: false,
              resultsStr,
              metadataStr,
              createdAt: now,
              updatedAt: now,
            });
          }

          console.log(
            `Generated status suggestion for thread ${threadId}: ${STATUS_LABELS[suggestedStatus]} (confidence: ${confidence.toFixed(2)})`,
          );
        } else {
          // No suggestion - deactivate any existing suggestions
          for (const existing of existingSuggestions) {
            if (existing.active) {
              await fetchClient.mutate.suggestion.update(existing.id, {
                active: false,
                metadataStr: JSON.stringify({
                  confidence,
                  reasoning,
                  currentStatus,
                  deactivatedAt: now.toISOString(),
                }),
                updatedAt: now,
              });
            }
          }

          console.log(
            `No status change suggested for thread ${threadId}: ${reasoning}`,
          );
        }

        return {
          threadId,
          success: true,
          data: {
            suggestedStatus,
            confidence,
            reasoning,
            cached: false,
          },
        };
      } catch (error) {
        console.error(
          `Suggest-status processor failed for thread ${threadId}:`,
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
