import type {
  Action,
  ExternalEntityOutcome,
  ReplyGrounding,
} from "@workspace/schemas/signals";
import { inferredGrounding } from "@workspace/schemas/signals";
import z from "zod";

interface ToolStep {
  toolResults: { output: unknown; toolName: string }[];
}

const outcomeSchema = z.enum([
  "delivered",
  "declined",
  "superseded",
  "unknown",
]);
const outputSchema = z.object({
  result: z
    .object({
      entity: z.object({
        externalKey: z.string(),
        number: z.number(),
        repoFullName: z.string(),
        url: z.string(),
      }),
      finished: z.boolean(),
      outcome: outcomeSchema,
      successor: z
        .object({
          entity: z.object({
            externalKey: z.string(),
            number: z.number(),
            repoFullName: z.string(),
            url: z.string(),
          }),
          finished: z.boolean(),
          outcome: outcomeSchema,
        })
        .nullable(),
    })
    .optional(),
  status: z.string(),
});

/** Outcomes that crossed the connector trust boundary in this synthesis run. */
export const collectVerifiedEntityOutcomes = (
  steps: ToolStep[]
): Map<string, ExternalEntityOutcome> => {
  const outcomes = new Map<string, ExternalEntityOutcome>();
  for (const step of steps) {
    for (const toolResult of step.toolResults) {
      if (toolResult.toolName !== "read_external_entity") {
        continue;
      }
      const parsed = outputSchema.safeParse(toolResult.output);
      if (!parsed.success || parsed.data.status !== "ok" || !parsed.data.result) {
        continue;
      }
      outcomes.set(
        parsed.data.result.entity.url,
        parsed.data.result.finished ? parsed.data.result.outcome : "unknown"
      );
      const successor = parsed.data.result.successor;
      if (successor) {
        outcomes.set(
          successor.entity.url,
          successor.finished ? successor.outcome : "unknown"
        );
      }
    }
  }
  return outcomes;
};

/** Exact provider references that must not leak into customer-facing prose. */
export const collectExternalReferenceTokens = (
  steps: ToolStep[]
): Set<string> => {
  const tokens = new Set<string>();
  for (const step of steps) {
    for (const toolResult of step.toolResults) {
      if (toolResult.toolName !== "read_external_entity") {
        continue;
      }
      const parsed = outputSchema.safeParse(toolResult.output);
      if (!parsed.success || parsed.data.status !== "ok" || !parsed.data.result) {
        continue;
      }
      const refs = [
        parsed.data.result.entity,
        parsed.data.result.successor?.entity,
      ].filter(Boolean);
      for (const ref of refs) {
        if (!ref) continue;
        tokens.add(ref.url);
        tokens.add(ref.externalKey);
        tokens.add(`${ref.repoFullName}#${ref.number}`);
        tokens.add(`#${ref.number}`);
      }
    }
  }
  return tokens;
};

export const replyContainsExternalReference = (
  action: Action,
  tokens: Set<string>
): boolean =>
  action.kind === "reply" &&
  [...tokens].some((token) => token.length > 0 && action.draftMarkdown.includes(token));

/**
 * Do not let model-authored outcome labels grant autonomy. Entity witnesses
 * must match a successful structural read; triggered state reports degrade to
 * inferred when that read failed or showed anything other than delivery.
 */
export const verifyEntityOutcomeActions = <T extends Action>(
  actions: T[],
  outcomes: Map<string, ExternalEntityOutcome>,
  requiredUrls: Set<string>
): T[] =>
  actions.map((action) => {
    if (
      action.kind === "set_status" &&
      action.witness?.class === "entity_settled"
    ) {
      const sourceOutcome = action.witness.sources
        .map((source) => outcomes.get(source))
        .find(Boolean);
      if (!sourceOutcome || sourceOutcome !== action.witness.outcome) {
        return {
          ...action,
          witness: { class: "inferred", sources: action.witness.sources },
        } as T;
      }
    }

    if (action.kind === "reply" && action.grounding?.class === "state_report") {
      const url = action.grounding.entityUrl?.trim() ?? "";
      const outcome = outcomes.get(url);
      if (
        (requiredUrls.has(url) && outcome !== "delivered") ||
        (outcome !== undefined && outcome !== "delivered")
      ) {
        return {
          ...action,
          grounding: inferredGrounding() as ReplyGrounding,
        } as T;
      }
    }
    return action;
  });
