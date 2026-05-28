import { google } from "@ai-sdk/google";
import type { createAILogger } from "@workspace/utils/logging";
import { generateText, Output } from "ai";
import z from "zod";
import type { SummarizeOutput } from "../../summarize";

export type DraftReplyInput = {
  threadName: string | null;
  recentMessages: Array<{
    role: "customer" | "agent" | "unknown";
    content: string;
  }>;
  summary: SummarizeOutput["summary"] | null;
  appliedLabels: string[];
  customInstructions: string | null;
};

export type DraftReplyResult = {
  draftMarkdown: string | null;
};

const responseSchema = z.object({
  draftMarkdown: z
    .string()
    .nullable()
    .describe(
      "The drafted reply to the latest inbound message, in Markdown. " +
        "Return null if there is nothing to reply to (e.g. the latest message " +
        "is already from the support team) or you cannot responsibly answer.",
    ),
});

export const draftReply = async (
  input: DraftReplyInput,
  ai?: ReturnType<typeof createAILogger>,
): Promise<DraftReplyResult> => {
  const transcript =
    input.recentMessages.length > 0
      ? input.recentMessages
          .map((m, i) => `${i + 1}. [${m.role}] ${m.content}`)
          .join("\n")
      : "(none)";

  const prompt = `You draft a reply to the latest inbound message in a customer support thread.

Write a helpful, on-tone Markdown reply that directly addresses the most recent customer message, using only information supported by the thread and the summary below. Do NOT invent product features, policies, prices, or facts that are not present in the context — when you don't know something, hedge or ask a clarifying question instead of guessing.

Write ONLY the body of the reply. Do NOT add a sign-off, closing salutation, or signature — no "Best regards", "Thanks,", "Cheers", "Sincerely", or "The <name> Team" line. The sender's name and signature are appended separately, so the reply must not end with one.

Return null (no draft) when:
- The most recent message is already from the support team / agent (nothing new to answer).
- There is nothing actionable to reply to.

${
  input.customInstructions
    ? `Organization voice & policy (follow these — they govern tone and what you may say):
${input.customInstructions}

`
    : ""
}${
    input.appliedLabels.length > 0
      ? `Applied labels (use these to gauge tone and which knowledge applies): ${input.appliedLabels.join(", ")}

`
      : ""
  }Thread title:
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

Return the drafted reply as Markdown, or null if no reply should be drafted.`;

  const baseModel = google("gemini-2.5-flash");
  const { output } = await generateText({
    model: ai ? ai.wrap(baseModel) : baseModel,
    output: Output.object({ schema: responseSchema }),
    prompt,
  });

  const draft = output.draftMarkdown?.trim();
  return { draftMarkdown: draft ? draft : null };
};
