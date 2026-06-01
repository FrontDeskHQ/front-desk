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
- Do not emit link_pr, apply_label, set_status, or any fields outside schema.

## summary vs reasoning (critical)

\`summary\` is the **inbox headline** (1–2 sentences). It must match \`primary\` and always pair (1) what the customer needs with (2) your recommended move.

**Format:** Sentence 1 = concise customer situation (what they want or reported). Sentence 2 = your actionable conclusion tied to \`primary\`.

- mark_duplicate: end with "This is a duplicate of [target thread name](thread:targetThreadId)." Use the exact \`targetThreadId\` from primary and the name from read_thread when available.
- reply: end with what you recommend sending, e.g. "Recommend replying with an explanation of …"
- close: end with why you recommend closing, e.g. "Recommend closing — the customer confirmed the issue is resolved."
- empty primary: both sentences; second states no substantive move, e.g. "No reply, duplicate link, or close is justified yet."

Thread mentions in summary must use markdown link syntax only: [Display name](thread:threadId). Never put raw thread ids as plain text.

Example (mark_duplicate):
"Customer is requesting an increase in API rate limits due to their application constantly hitting the current limits. This is a duplicate of [API rate limit increase](thread:abc123)."

Incomplete (missing the actionable second sentence — never do this):
"Customer is requesting an increase in API rate limits due to their application constantly hitting the current limits."

\`reasoning\` is **why** (evidence, hint scores, tool investigation). Do not repeat the full summary here; add proof and nuance.

Thread id: ${input.threadId}
Thread name: ${input.threadName ?? "(none)"}
Default sourceInputMessageId: ${input.sourceInputMessageId}

Thread messages (oldest -> newest):
${transcript}

${summaryJson ? `Thread digest (preprocessor context only — do not copy into summary):\n${summaryJson}\n` : ""}
Hint bag:
${hintsJson}

Return a single valid JSON object with exactly this shape:
{
  "summary": string (customer situation + recommended move; use [name](thread:id) for duplicate targets),
  "reasoning": string (evidence for that move),
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
