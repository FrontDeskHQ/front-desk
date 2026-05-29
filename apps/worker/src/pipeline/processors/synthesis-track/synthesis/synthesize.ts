import { google } from "@ai-sdk/google";
import type { Hints } from "@workspace/schemas/signals";
import {
  closeActionSchema,
  markDuplicateActionSchema,
  replyActionSchema,
} from "@workspace/schemas/signals";
import type { createAILogger } from "@workspace/utils/logging";
import { generateText, stepCountIs } from "ai";
import z from "zod";
import type { ParsedSummary } from "../../../../types";

const synthesisActionSchema = z.discriminatedUnion("kind", [
  replyActionSchema,
  markDuplicateActionSchema,
  closeActionSchema,
]);

const synthesisRawActionSetSchema = z.object({
  summary: z.string(),
  reasoning: z.string(),
  primary: z.array(synthesisActionSchema),
  alternatives: z.array(synthesisActionSchema).default([]),
  urgencyScore: z.number().min(0).max(100),
  sourceInputMessageId: z.string(),
});

export type SynthesisRawActionSet = z.infer<typeof synthesisRawActionSetSchema>;

export type SynthesizeThreadReadInput = {
  threadId: string;
  threadName: string | null;
  threadMessages: Array<{
    id: string;
    content: string;
    authorId: string;
    createdAt: string;
  }>;
  summary: ParsedSummary | null;
  hints: Hints;
  sourceInputMessageId: string;
};

const parseRawActionSetFromText = (text: string): SynthesisRawActionSet => {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fencedMatch?.[1] ?? trimmed).trim();
  const parsed = JSON.parse(candidate);
  return synthesisRawActionSetSchema.parse(parsed);
};

export const synthesizeThreadRead = async (
  input: SynthesizeThreadReadInput,
  tools: ReturnType<
    typeof import("./tools").createSynthesisTools
  >,
  ai?: ReturnType<typeof createAILogger>,
): Promise<SynthesisRawActionSet> => {
  const transcript =
    input.threadMessages.length > 0
      ? input.threadMessages
          .map(
            (message, index) =>
              `${index + 1}. [messageId=${message.id}] ${message.content}`,
          )
          .join("\n")
      : "(none)";

  const hintsJson = JSON.stringify(input.hints ?? {}, null, 2);
  const summaryJson = input.summary ? JSON.stringify(input.summary, null, 2) : "";

  const prompt = `You are the synthesis agent for a customer support thread.

You must produce an unfiltered raw action set using only this vocabulary:
- reply (requires draftMarkdown)
- mark_duplicate (requires targetThreadId)
- close

Use hints as evidence leads, not as final decisions. Investigate with tools before taking substantive actions.

Requirements:
- If duplicate evidence exists, verify by reading the target thread with read_thread before choosing mark_duplicate.
- Prefer no action over weak/conflicting evidence. If no substantive move is justified, return an empty primary array.
- sourceInputMessageId must be one of the provided message ids and should usually be the latest inbound message.
- Keep summary and reasoning concise and specific to this thread.
- Do not emit link_pr, apply_label, set_status, or any fields outside schema.

Thread id: ${input.threadId}
Thread name: ${input.threadName ?? "(none)"}
Default sourceInputMessageId: ${input.sourceInputMessageId}

Thread messages (oldest -> newest):
${transcript}

${summaryJson ? `Summary:\n${summaryJson}\n` : ""}
Hint bag:
${hintsJson}

Return a single valid JSON object with exactly this shape:
{
  "summary": string,
  "reasoning": string,
  "primary": Array<{ "kind": "reply", "draftMarkdown": string } | { "kind": "mark_duplicate", "targetThreadId": string } | { "kind": "close" }>,
  "alternatives": Array<{ "kind": "reply", "draftMarkdown": string } | { "kind": "mark_duplicate", "targetThreadId": string } | { "kind": "close" }>,
  "urgencyScore": number (0-100),
  "sourceInputMessageId": string
}
`;

  const baseModel = google("gemini-2.5-flash");
  const { text } = await generateText({
    model: ai ? ai.wrap(baseModel) : baseModel,
    prompt,
    tools,
    stopWhen: stepCountIs(8),
  });

  return parseRawActionSetFromText(text);
};
