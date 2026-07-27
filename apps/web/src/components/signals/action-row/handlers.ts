import {
  ACTION_KIND_LABEL,
  fingerprintAgentRead,
} from "@workspace/schemas/signals";
import type {
  Action,
  InlineSuggestion,
  ThreadRead,
} from "@workspace/schemas/signals";

import { mutate } from "~/lib/live-state";

export interface ActorContext {
  user: { id: string; name: string };
  organizationId: string;
  posthog: { capture: (e: string, p?: Record<string, unknown>) => void } | null;
}

type ReadSelection =
  | "primary"
  | { alternativeIndex: number }
  | { primaryActionIndices: number[] };

const resolveSelectedActions = (
  read: ThreadRead,
  selection: ReadSelection
): Action[] => {
  if (selection === "primary") {
    return read.primary;
  }
  if ("alternativeIndex" in selection) {
    const alternative = read.alternatives?.[selection.alternativeIndex];
    return alternative ? [alternative] : [];
  }
  return selection.primaryActionIndices
    .map((index) => read.primary[index])
    .filter(
      (action): action is Action => action !== null && action !== undefined
    );
};

const formatSelection = (selection?: ReadSelection): string | undefined => {
  if (selection === undefined) {
    return undefined;
  }
  if (selection === "primary") {
    return "primary";
  }
  if ("alternativeIndex" in selection) {
    return `alternative:${selection.alternativeIndex}`;
  }
  return `primary:${selection.primaryActionIndices.join(",")}`;
};

const summarizeActionKinds = (actions: Action[]): string[] =>
  actions.map((action) => ACTION_KIND_LABEL[action.kind]);

const captureReadEvent = (
  ctx: ActorContext,
  event: "signal:read_accept" | "signal:read_dismiss",
  payload: {
    threadId: string;
    read: ThreadRead;
    selection?: ReadSelection;
  }
) => {
  ctx.posthog?.capture(event, {
    alternative_action_kinds: (payload.read.alternatives ?? []).map(
      (action) => action.kind
    ),
    organization_id: ctx.organizationId,
    primary_action_kinds: payload.read.primary.map((action) => action.kind),
    read_fingerprint: fingerprintAgentRead(payload.read),
    selection: formatSelection(payload.selection),
    thread_id: payload.threadId,
  });
};

export async function acceptThreadRead(input: {
  threadId: string;
  read: ThreadRead;
  selection: ReadSelection;
  ctx: ActorContext;
  replyDraft?: string;
}) {
  const readFingerprint = fingerprintAgentRead(input.read);
  await mutate.thread.acceptRead({
    organizationId: input.ctx.organizationId,
    readFingerprint,
    replyDraft: input.replyDraft,
    selection: input.selection,
    threadId: input.threadId,
  });

  const selectedActions = resolveSelectedActions(input.read, input.selection);

  captureReadEvent(input.ctx, "signal:read_accept", {
    read: input.read,
    selection: input.selection,
    threadId: input.threadId,
  });

  input.ctx.posthog?.capture("signal:read_accept_actions", {
    action_labels: summarizeActionKinds(selectedActions),
    organization_id: input.ctx.organizationId,
    thread_id: input.threadId,
  });
}

export async function dismissThreadRead(input: {
  threadId: string;
  read: ThreadRead;
  ctx: ActorContext;
}) {
  const readFingerprint = fingerprintAgentRead(input.read);
  await mutate.thread.dismissRead({
    organizationId: input.ctx.organizationId,
    readFingerprint,
    threadId: input.threadId,
  });

  captureReadEvent(input.ctx, "signal:read_dismiss", {
    read: input.read,
    threadId: input.threadId,
  });
}

export async function acceptInlineSuggestion(input: {
  threadId: string;
  suggestion: InlineSuggestion;
  ctx: ActorContext;
}) {
  await mutate.thread.acceptInlineSuggestion({
    organizationId: input.ctx.organizationId,
    suggestionId: input.suggestion.id,
    threadId: input.threadId,
  });

  input.ctx.posthog?.capture("signal:inline_suggestion_accept", {
    action_kind: input.suggestion.action.kind,
    organization_id: input.ctx.organizationId,
    suggestion_id: input.suggestion.id,
    thread_id: input.threadId,
  });
}

export async function dismissInlineSuggestion(input: {
  threadId: string;
  suggestion: InlineSuggestion;
  ctx: ActorContext;
}) {
  await mutate.thread.dismissInlineSuggestion({
    organizationId: input.ctx.organizationId,
    suggestionId: input.suggestion.id,
    threadId: input.threadId,
  });

  input.ctx.posthog?.capture("signal:inline_suggestion_dismiss", {
    action_kind: input.suggestion.action.kind,
    organization_id: input.ctx.organizationId,
    suggestion_id: input.suggestion.id,
    thread_id: input.threadId,
  });
}
