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
  steps: ToolStep[],
  requiredUrls: ReadonlySet<string> = new Set()
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
      if (
        requiredUrls.size > 0 &&
        !requiredUrls.has(parsed.data.result.entity.url)
      ) {
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

export const addExternalEntityReferenceTokens = (
  tokens: Set<string>,
  entity: { externalKey: string; url: string }
): void => {
  tokens.add(entity.externalKey);
  tokens.add(entity.url);
  const parsedKey = /^[^:]+:(.+)#(\d+)$/.exec(entity.externalKey);
  if (parsedKey?.[1] && parsedKey[2]) {
    tokens.add(`${parsedKey[1]}#${parsedKey[2]}`);
    tokens.add(`#${parsedKey[2]}`);
  }
};

const trackerReferenceFromUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const segments = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean);
    const entityIndex = segments.findIndex(
      (segment, index) =>
        ["issues", "merge_requests", "pull", "pulls"].includes(
          segment.toLowerCase()
        ) && /^\d+$/.test(segments[index + 1] ?? "")
    );
    const number = segments[entityIndex + 1];
    if (entityIndex < 1 || !number || !/^\d+$/.test(number)) {
      return null;
    }
    const repository = segments
      .slice(0, entityIndex)
      .filter((segment) => segment !== "-")
      .join("/")
      .toLowerCase();
    const kind = ["pull", "pulls", "merge_requests"].includes(
      segments[entityIndex]?.toLowerCase() ?? ""
    )
      ? "pull_request"
      : "issue";
    return `${host}:${repository}:${kind}:${number}`;
  } catch {
    return null;
  }
};

const containsEquivalentTrackerUrl = (
  markdown: string,
  tokens: Set<string>
): boolean => {
  const protectedReferences = new Set(
    [...tokens]
      .map(trackerReferenceFromUrl)
      .filter((reference): reference is string => reference !== null)
  );
  if (protectedReferences.size === 0) {
    return false;
  }
  const urls = markdown.match(/(?:https?:)?\/\/[^\s<>"')\]]+/gi) ?? [];
  return urls.some((candidate) => {
    const absoluteCandidate = candidate.startsWith("//")
      ? `https:${candidate}`
      : candidate;
    const reference = trackerReferenceFromUrl(
      absoluteCandidate.replace(/[.,;:!?]+$/, "")
    );
    return reference !== null && protectedReferences.has(reference);
  });
};

export const replyContainsExternalReference = (
  action: Action,
  tokens: Set<string>
): boolean =>
  action.kind === "reply" &&
  ([...tokens].some(
    (token) => token.length > 0 && action.draftMarkdown.includes(token)
  ) ||
    containsEquivalentTrackerUrl(action.draftMarkdown, tokens) ||
    /\b(?:issue|pull\s+request|pr)\s*#?\s*\d+\b/i.test(
      action.draftMarkdown
    ));

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
      const allSourcesMatch =
        action.witness.sources.length > 0 &&
        action.witness.sources.every(
          (source) => outcomes.get(source) === action.witness?.outcome
        );
      if (!allSourcesMatch) {
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
        (requiredUrls.size > 0 && outcome !== "delivered") ||
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
