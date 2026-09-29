import {
  type ScoreWithSpanInput,
  SPAN_PRO_MODEL,
  type SpanBehaviorResult,
  scoreWithSpan,
} from "../../../../lib/respan";
import type { AgentRunAudit } from "../../../core/agent-run-audit";
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

/** Below this `p_present` the top label counts as no label. */
export const SUGGEST_THRESHOLD = 0.5;

// Span-01 judges each label on its own, so the shared rules ride along in
// every definition.
const labelDefinition = (name: string) =>
  `The customer's message belongs under the support label "${name}". A page or surface failing with an error code or exception is a bug, even when that surface is for billing, account, or integrations. Off-topic messages (sales or partnership inquiries, hiring questions, greetings, thank-yous, spam) and vague complaints with no concrete detail match no label.`;

const ACKNOWLEDGMENT = "Thanks for reaching out. We're looking into this.";

const customerMessage = (input: ClassifyLabelInput): string => {
  const parts = [
    input.threadName ? `Title: ${input.threadName}` : null,
    input.firstMessageContent,
  ];
  if (!input.firstMessageContent && input.summary) {
    parts.push(input.summary.shortDescription);
  }
  return parts.filter(Boolean).join("\n\n") || "(empty)";
};

/**
 * One Span-01 behavior per org label. Confidence is the winning label's
 * `p_present`, so the processor's thresholds apply to a real probability.
 */
export const classifyLabel = async (
  input: ClassifyLabelInput,
  audit?: AgentRunAudit
): Promise<ClassifyLabelResult> => {
  if (input.orgLabels.length === 0) {
    return { confidence: 0, labelId: null };
  }

  const request: ScoreWithSpanInput = {
    behaviors: input.orgLabels.map((l) => ({
      definition: labelDefinition(l.name),
      id: l.id,
    })),
    model: SPAN_PRO_MODEL,
    // Span-01 only judges assistant turns. The label is a property of the
    // customer's message, so it goes in `input` and the output is a neutral
    // acknowledgment that carries no signal of its own.
    span: {
      input: [{ content: customerMessage(input), role: "user" }],
      output: { content: ACKNOWLEDGMENT, role: "assistant" },
    },
  };
  audit?.record(
    "model.requested",
    { input, model: { modelId: request.model, provider: "respan" }, request },
    { phase: "label_classifier" }
  );

  const modelStartedAt = performance.now();
  let score: Awaited<ReturnType<typeof scoreWithSpan>>;
  try {
    score = await scoreWithSpan(request);
  } catch (error) {
    audit?.record(
      "model.failed",
      {
        durationMs: performance.now() - modelStartedAt,
        error,
        status: "failed",
      },
      { phase: "label_classifier" }
    );
    throw error;
  }

  audit?.record(
    "model.completed",
    {
      durationMs: performance.now() - modelStartedAt,
      output: score.results,
      totalUsage: score.usage,
    },
    { phase: "label_classifier" }
  );

  const labelIds = new Set(input.orgLabels.map((l) => l.id));
  let best: SpanBehaviorResult | undefined;
  for (const result of score.results) {
    if (labelIds.has(result.id) && result.p_present > (best?.p_present ?? 0)) {
      best = result;
    }
  }
  const confidence = best?.p_present ?? 0;
  return {
    confidence,
    labelId: best && confidence >= SUGGEST_THRESHOLD ? best.id : null,
  };
};
