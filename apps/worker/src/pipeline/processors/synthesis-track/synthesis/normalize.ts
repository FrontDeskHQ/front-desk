import type { Action, ThreadRead } from "@workspace/schemas/signals";
import {
  sanitizeAgentReadReasoning,
  threadReadSchema,
} from "@workspace/schemas/signals";
import type { SynthesisRawActionSet } from "./synthesize";

const allowedKinds = new Set(["reply", "mark_duplicate", "close"]);

const normalizeAction = (action: Action): Action | null => {
  if (!allowedKinds.has(action.kind)) return null;

  if (action.kind === "reply") {
    const draftMarkdown = action.draftMarkdown.trim();
    if (draftMarkdown.length === 0) return null;
    return { kind: "reply", draftMarkdown };
  }

  if (action.kind === "mark_duplicate") {
    if (!action.targetThreadId.trim()) return null;
    return { kind: "mark_duplicate", targetThreadId: action.targetThreadId };
  }

  return { kind: "close" };
};

const orderPrimaryForExecution = (actions: Action[]): Action[] => {
  const reply = actions.find((action) => action.kind === "reply");
  const nonReply = actions.filter((action) => action.kind !== "reply");
  if (!reply) return actions;
  return [...nonReply, reply];
};

export const normalizeSynthesisRawActionSet = ({
  output,
  messageIds,
  fallbackSourceInputMessageId,
  hasTeamReply,
}: {
  output: SynthesisRawActionSet;
  messageIds: Set<string>;
  fallbackSourceInputMessageId: string;
  hasTeamReply: boolean;
}): ThreadRead | null => {
  let primary = output.primary
    .map((action) => normalizeAction(action as Action))
    .filter((action): action is Action => action !== null);

  if (primary.length === 0) return null;

  let alternatives = (output.alternatives ?? [])
    .map((action) => normalizeAction(action as Action))
    .filter((action): action is Action => action !== null);

  if (!hasTeamReply) {
    alternatives = alternatives.filter((action) => action.kind === "reply");
    const primaryHasNonReply = primary.some((action) => action.kind !== "reply");
    const primaryHasReply = primary.some((action) => action.kind === "reply");
    if (primaryHasNonReply && !primaryHasReply) {
      return null;
    }
    primary = orderPrimaryForExecution(primary);
  }

  const rawActionSet: ThreadRead = {
    summary: output.summary.trim(),
    recommendation: output.recommendation.trim(),
    reasoning: sanitizeAgentReadReasoning(output.reasoning),
    urgencyScore: output.urgencyScore,
    sourceInputMessageId: messageIds.has(output.sourceInputMessageId)
      ? output.sourceInputMessageId
      : fallbackSourceInputMessageId,
    createdAt: new Date().toISOString(),
    primary,
    alternatives,
  };

  return threadReadSchema.parse(rawActionSet);
};
