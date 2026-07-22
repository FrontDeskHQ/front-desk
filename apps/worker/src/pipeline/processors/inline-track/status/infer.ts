import { google } from "@ai-sdk/google";
import type { createAILogger } from "@workspace/utils/logging";
import { generateText, Output } from "ai";
import z from "zod";

import type { SummarizeOutput } from "../../summarize";

export interface AllowedStatus {
  code: number;
  label: string;
}

export interface InferStatusInput {
  threadName: string | null;
  latestMessageContent: string | null;
  recentMessages: {
    role: "customer" | "agent" | "unknown";
    content: string;
  }[];
  summary: SummarizeOutput["summary"] | null;
  currentStatus: number;
  allowedStatuses: AllowedStatus[];
}

export interface InferStatusResult {
  status: number | null;
  confidence: number;
}

const responseSchema = z.object({
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence in the status choice, from 0 to 1."),
  status: z
    .number()
    .int()
    .nullable()
    .describe(
      "The status code that best reflects the thread after the latest message, or null if no change is warranted."
    ),
});

export const inferStatus = async (
  input: InferStatusInput,
  ai?: ReturnType<typeof createAILogger>
): Promise<InferStatusResult> => {
  if (input.allowedStatuses.length === 0) {
    return { confidence: 0, status: null };
  }

  const statusList = input.allowedStatuses
    .map((s) => `- ${s.code}: ${s.label}`)
    .join("\n");

  const currentLabel =
    input.allowedStatuses.find((s) => s.code === input.currentStatus)?.label ??
    `code ${input.currentStatus}`;

  const transcript =
    input.recentMessages.length > 0
      ? input.recentMessages
          .map((m, i) => `${i + 1}. [${m.role}] ${m.content}`)
          .join("\n")
      : input.latestMessageContent
        ? `1. [unknown] ${input.latestMessageContent}`
        : "(none)";

  const prompt = `You infer the appropriate status of a support thread after its latest message.

Pick exactly ONE status code from the list, or return null if the latest activity does not justify a status change.

Guidelines:
- Customer confirming the issue is fixed ("thanks, that worked", "all good now") → Resolved.
- Customer replying with a new question or fresh problem on a previously resolved/closed thread → Open.
- Agent or teammate posting a clarifying question, awaiting more info from the customer → keep status as-is or move to "In progress" depending on the taxonomy.
- Off-topic chit-chat, greetings, or messages that don't change the state of the request → null.
- When in doubt, return null with low confidence rather than guess.

Resolved vs Closed — these are NOT interchangeable:
- **Resolved** means the issue was SOLVED. The customer got the help they needed: a fix landed, a question was answered, a request was fulfilled. The thread had a real problem and the problem is now gone.
- **Closed** means the thread is DISMISSED — it was never a real issue we needed to act on. Use this for spam, off-topic inquiries (sales, partnerships, hiring), threads that turned out to be a misunderstanding, threads the customer asks to close without a fix, or threads superseded/dismissed by an agent (e.g. "closing this as a duplicate", "not something we support").
- If a customer says "thanks, that fixed it" → Resolved, not Closed.
- If a customer says "never mind, you can close this" without a fix → Closed.
- If an agent closes the thread because it's out of scope or a duplicate → Closed.

Available statuses (code: label):
${statusList}

Current status: ${input.currentStatus} (${currentLabel})

Thread title:
${input.threadName ?? "(none)"}

Recent messages (oldest → newest):
${transcript}

${
  input.summary
    ? `Normalized summary:
- title: ${input.summary.title}
- shortDescription: ${input.summary.shortDescription}
- keywords: ${input.summary.keywords.join(", ")}
- entities: ${input.summary.entities.join(", ")}
- expectedAction: ${input.summary.expectedAction}`
    : ""
}

Return the chosen status code (one of the listed integers) or null. Confidence should reflect how confident you are; use values below 0.5 when uncertain, above 0.85 only when the transition is unambiguous.`;

  const baseModel = google("gemini-2.5-flash-lite");
  const { output } = await generateText({
    model: ai ? ai.wrap(baseModel) : baseModel,
    output: Output.object({ schema: responseSchema }),
    prompt,
  });

  const valid =
    output.status !== null &&
    input.allowedStatuses.some((s) => s.code === output.status);
  // Filter: if the model's pick matches the current status, treat as "no change".
  // Skip-on-equality belongs to the inference contract, not the caller — keeps
  // the processor and the eval honest about what counts as an emission.
  const matchesCurrent = valid && output.status === input.currentStatus;
  return {
    confidence: output.confidence,
    status: valid && !matchesCurrent ? output.status : null,
  };
};
