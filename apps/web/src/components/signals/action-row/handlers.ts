import {
  ACTION_KIND_LABEL,
  fingerprintAgentRead,
  type Action,
  type InlineSuggestion,
  type ThreadRead,
} from "@workspace/schemas/signals";
import { mutate } from "~/lib/live-state";

export type ActorContext = {
  user: { id: string; name: string };
  organizationId: string;
  posthog: { capture: (e: string, p?: Record<string, unknown>) => void } | null;
};

type ReadSelection = "primary" | { alternativeIndex: number };

const summarizeActionKinds = (actions: Action[]): string[] =>
  actions.map((action) => ACTION_KIND_LABEL[action.kind]);

const captureReadEvent = (
  ctx: ActorContext,
  event: "signal:read_accept" | "signal:read_dismiss",
  payload: {
    threadId: string;
    read: ThreadRead;
    selection?: ReadSelection;
  },
) => {
  ctx.posthog?.capture(event, {
    thread_id: payload.threadId,
    organization_id: ctx.organizationId,
    read_fingerprint: fingerprintAgentRead(payload.read),
    primary_action_kinds: payload.read.primary.map((action) => action.kind),
    alternative_action_kinds: (payload.read.alternatives ?? []).map(
      (action) => action.kind,
    ),
    selection:
      payload.selection === undefined
        ? undefined
        : payload.selection === "primary"
          ? "primary"
          : `alternative:${payload.selection.alternativeIndex}`,
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
    threadId: input.threadId,
    organizationId: input.ctx.organizationId,
    selection: input.selection,
    readFingerprint,
    replyDraft: input.replyDraft,
  });

  const selectedActions =
    input.selection === "primary"
      ? input.read.primary
      : input.read.alternatives?.[input.selection.alternativeIndex]
        ? [input.read.alternatives[input.selection.alternativeIndex]]
        : [];

  captureReadEvent(input.ctx, "signal:read_accept", {
    threadId: input.threadId,
    read: input.read,
    selection: input.selection,
  });

  input.ctx.posthog?.capture("signal:read_accept_actions", {
    thread_id: input.threadId,
    organization_id: input.ctx.organizationId,
    action_labels: summarizeActionKinds(selectedActions),
  });
}

export async function dismissThreadRead(input: {
  threadId: string;
  read: ThreadRead;
  ctx: ActorContext;
}) {
  const readFingerprint = fingerprintAgentRead(input.read);
  await mutate.thread.dismissRead({
    threadId: input.threadId,
    organizationId: input.ctx.organizationId,
    readFingerprint,
  });

  captureReadEvent(input.ctx, "signal:read_dismiss", {
    threadId: input.threadId,
    read: input.read,
  });
}

export async function acceptInlineSuggestion(input: {
  threadId: string;
  suggestion: InlineSuggestion;
  ctx: ActorContext;
}) {
  await mutate.thread.acceptInlineSuggestion({
    threadId: input.threadId,
    organizationId: input.ctx.organizationId,
    suggestionId: input.suggestion.id,
  });

  input.ctx.posthog?.capture("signal:inline_suggestion_accept", {
    thread_id: input.threadId,
    organization_id: input.ctx.organizationId,
    suggestion_id: input.suggestion.id,
    action_kind: input.suggestion.action.kind,
  });
}

export async function dismissInlineSuggestion(input: {
  threadId: string;
  suggestion: InlineSuggestion;
  ctx: ActorContext;
}) {
  await mutate.thread.dismissInlineSuggestion({
    threadId: input.threadId,
    organizationId: input.ctx.organizationId,
    suggestionId: input.suggestion.id,
  });

  input.ctx.posthog?.capture("signal:inline_suggestion_dismiss", {
    thread_id: input.threadId,
    organization_id: input.ctx.organizationId,
    suggestion_id: input.suggestion.id,
    action_kind: input.suggestion.action.kind,
  });
}
