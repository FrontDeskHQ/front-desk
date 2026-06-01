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

export const normalizeSynthesisRawActionSet = ({
  output,
  messageIds,
  fallbackSourceInputMessageId,
}: {
  output: SynthesisRawActionSet;
  messageIds: Set<string>;
  fallbackSourceInputMessageId: string;
}): ThreadRead | null => {
  const primary = output.primary
    .map((action) => normalizeAction(action as Action))
    .filter((action): action is Action => action !== null);

  if (primary.length === 0) return null;

  const alternatives = (output.alternatives ?? [])
    .map((action) => normalizeAction(action as Action))
    .filter((action): action is Action => action !== null);

  const rawActionSet: ThreadRead = {
    summary: output.summary.trim(),
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
