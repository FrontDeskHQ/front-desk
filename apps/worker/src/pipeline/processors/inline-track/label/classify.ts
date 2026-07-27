import { google } from "@ai-sdk/google";
import type { createAILogger } from "@workspace/utils/logging";
import { generateText, Output } from "ai";
import z from "zod";

import type { SummarizeOutput } from "../../summarize";

export interface ClassifyLabelInput {
  threadName: string | null;
  firstMessageContent: string | null;
  summary: SummarizeOutput["summary"] | null;
  orgLabels: { id: string; name: string }[];
}

export interface ClassifyLabelResult {
  labelId: string | null;
  confidence: number;
}

const responseSchema = z.object({
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence in the labelId choice, from 0 to 1."),
  labelId: z
    .string()
    .nullable()
    .describe(
      "The id of the single best-matching label from the provided list, or null if none fit."
    ),
});

export const classifyLabel = async (
  input: ClassifyLabelInput,
  ai?: ReturnType<typeof createAILogger>
): Promise<ClassifyLabelResult> => {
  if (input.orgLabels.length === 0) {
    return { confidence: 0, labelId: null };
  }

  const labelList = input.orgLabels
    .map((l) => `- ${l.id}: ${l.name}`)
    .join("\n");

  const prompt = `You classify a support thread under at most ONE label from a fixed list. Pick the single best fit, or null if no label is a clear match.

Common confusions to avoid:
- A page or surface failing with an error code/exception is a bug-type label, even when that surface is for billing, account, or integrations.
- Off-topic threads (sales/partnership inquiries, hiring questions, greetings, thank-yous, spam) should return null, not be forced into the closest-sounding label.
- A vague complaint with no concrete detail ("something is wrong", "it doesn't work") should return null with low confidence, not a bug label.

Available labels (id: name):
${labelList}

Thread title:
${input.threadName ?? "(none)"}

First message:
${input.firstMessageContent ?? "(none)"}

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

Return the chosen label id (exactly as listed) or null. Confidence should reflect how confident you are; use values below 0.5 when uncertain, above 0.85 only when the match is unambiguous.`;

  const baseModel = google("gemini-2.5-flash-lite");
  const { output } = await generateText({
    model: ai ? ai.wrap(baseModel) : baseModel,
    output: Output.object({ schema: responseSchema }),
    prompt,
  });

  const valid = input.orgLabels.some((l) => l.id === output.labelId);
  return {
    confidence: output.confidence,
    labelId: valid ? output.labelId : null,
  };
};
