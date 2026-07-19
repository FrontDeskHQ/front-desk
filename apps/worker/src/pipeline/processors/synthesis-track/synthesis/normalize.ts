import type { Action, ThreadRead } from "@workspace/schemas/signals";
import {
  sanitizeAgentReadReasoning,
  threadReadSchema,
} from "@workspace/schemas/signals";
import type { SynthesisRawActionSet } from "./synthesize";

const allowedKinds = new Set(["reply", "mark_duplicate", "link_pr", "close"]);

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

  if (action.kind === "link_pr") {
    const prUrl = action.prUrl.trim();
    if (prUrl.length === 0) return null;
    return { kind: "link_pr", prUrl };
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

  // At most one link_pr across the whole action set (design lock, FRO-204): a
  // thread links a single PR. Keep the first — primary takes precedence over
  // alternatives — and drop any further link_pr entries.
  let linkPrSeen = false;
  const dedupeLinkPr = (actions: Action[]): Action[] =>
    actions.filter((action) => {
      if (action.kind !== "link_pr") return true;
      if (linkPrSeen) return false;
      linkPrSeen = true;
      return true;
    });
  primary = dedupeLinkPr(primary);
  alternatives = dedupeLinkPr(alternatives);

  if (!hasTeamReply) {
    alternatives = alternatives.filter((action) => action.kind === "reply");
    const primaryHasNonReply = primary.some(
      (action) => action.kind !== "reply",
    );
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
