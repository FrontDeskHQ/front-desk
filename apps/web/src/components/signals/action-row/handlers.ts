import type { InferLiveObject } from "@live-state/sync";
import { statusValues } from "@workspace/ui/components/indicator";
import type { schema } from "api/schema";
import { ulid } from "ulid";
import { mutate } from "~/lib/live-state";

type Thread = InferLiveObject<typeof schema.thread>;

export type ActorContext = {
  user: { id: string; name: string };
  organizationId: string;
  posthog: { capture: (e: string, p?: Record<string, unknown>) => void } | null;
};

export type SuggestionRow = {
  id: string;
  type: string;
  entityId: string;
  relatedEntityId: string | null;
  resultsStr: string | null;
  metadataStr: string | null;
  createdAt: Date;
  urgencyScore: number;
};

function dismiss(suggestionId: string) {
  mutate.suggestion.update(suggestionId, {
    accepted: false,
    active: false,
    dismissedAt: new Date(),
    updatedAt: new Date(),
  });
}

function act(suggestionId: string) {
  mutate.suggestion.update(suggestionId, {
    accepted: true,
    active: false,
    actedAt: new Date(),
    updatedAt: new Date(),
  });
}

export function acceptStatusSuggestion(
  suggestion: SuggestionRow & { suggestedStatus: number },
  thread: Thread | undefined,
  ctx: ActorContext,
) {
  if (!thread) return;
  const oldStatus = thread.status;
  const newStatus = suggestion.suggestedStatus;
  const oldStatusLabel = statusValues[oldStatus]?.label ?? "Unknown";
  const newStatusLabel = statusValues[newStatus]?.label ?? "Unknown";

  mutate.thread.update(suggestion.entityId, { status: newStatus });
  mutate.update.insert({
    id: ulid().toLowerCase(),
    threadId: suggestion.entityId,
    type: "status_changed",
    createdAt: new Date(),
    userId: ctx.user.id,
    metadataStr: JSON.stringify({
      oldStatus,
      newStatus,
      oldStatusLabel,
      newStatusLabel,
      userName: ctx.user.name,
      source: "signal",
    }),
    replicatedStr: JSON.stringify({}),
  });
  act(suggestion.id);

  ctx.posthog?.capture("signal:suggestion_accept", {
    thread_id: suggestion.entityId,
    suggestion_id: suggestion.id,
    organization_id: ctx.organizationId,
  });
}

export function dismissStatusSuggestion(
  suggestion: SuggestionRow,
  ctx: ActorContext,
) {
  dismiss(suggestion.id);
  ctx.posthog?.capture("signal:suggestion_dismiss", {
    thread_id: suggestion.entityId,
    suggestion_id: suggestion.id,
    organization_id: ctx.organizationId,
  });
}

export function acceptDuplicateSuggestion(
  suggestion: SuggestionRow & { targetThreadId: string },
  thread: Thread | undefined,
  targetThread: Thread | undefined,
  ctx: ActorContext,
) {
  if (!thread) return;
  mutate.thread.update(suggestion.entityId, { status: 4 });
  mutate.update.insert({
    id: ulid().toLowerCase(),
    threadId: suggestion.entityId,
    type: "marked_duplicate",
    createdAt: new Date(),
    userId: ctx.user.id,
    metadataStr: JSON.stringify({
      duplicateOfThreadId: suggestion.targetThreadId,
      duplicateOfThreadName: targetThread?.name,
      userName: ctx.user.name,
      source: "signal",
    }),
    replicatedStr: JSON.stringify({}),
  });
  act(suggestion.id);

  ctx.posthog?.capture("signal:duplicate_accept", {
    thread_id: suggestion.entityId,
    target_thread_id: suggestion.targetThreadId,
    suggestion_id: suggestion.id,
    organization_id: ctx.organizationId,
  });
}

export function dismissDuplicateSuggestion(
  suggestion: SuggestionRow & { targetThreadId: string },
  ctx: ActorContext,
) {
  dismiss(suggestion.id);
  ctx.posthog?.capture("signal:duplicate_dismiss", {
    thread_id: suggestion.entityId,
    target_thread_id: suggestion.targetThreadId,
    suggestion_id: suggestion.id,
    organization_id: ctx.organizationId,
  });
}

export function acceptLinkedPrSuggestion(
  suggestion: SuggestionRow & {
    prId: number;
    prNumber: number;
    repo: string;
  },
  thread: Thread | undefined,
  ctx: ActorContext,
) {
  if (!thread) return;
  const externalPrId = `github:${suggestion.repo}#${suggestion.prId}`;
  const oldPrId = thread.externalPrId ?? null;

  mutate.thread.update(suggestion.entityId, { externalPrId });
  mutate.update.insert({
    id: ulid().toLowerCase(),
    threadId: suggestion.entityId,
    type: "pr_changed",
    createdAt: new Date(),
    userId: ctx.user.id,
    metadataStr: JSON.stringify({
      oldPrId,
      newPrId: externalPrId,
      oldPrLabel: null,
      newPrLabel: `${suggestion.repo}#${suggestion.prNumber}`,
      userName: ctx.user.name,
      source: "signal",
    }),
    replicatedStr: JSON.stringify({}),
  });
  act(suggestion.id);

  ctx.posthog?.capture("signal:linked_pr_accept", {
    thread_id: suggestion.entityId,
    suggestion_id: suggestion.id,
    pr_number: suggestion.prNumber,
    repo: suggestion.repo,
    organization_id: ctx.organizationId,
  });
}

export function dismissLinkedPrSuggestion(
  suggestion: SuggestionRow & { prNumber: number; repo: string },
  ctx: ActorContext,
) {
  dismiss(suggestion.id);
  ctx.posthog?.capture("signal:linked_pr_dismiss", {
    thread_id: suggestion.entityId,
    suggestion_id: suggestion.id,
    pr_number: suggestion.prNumber,
    repo: suggestion.repo,
    organization_id: ctx.organizationId,
  });
}

export function dismissDigestSuggestion(
  suggestion: SuggestionRow,
  type: "digest:pending_reply" | "digest:loop_to_close",
  ctx: ActorContext,
) {
  dismiss(suggestion.id);
  ctx.posthog?.capture("signal:digest_dismiss", {
    type,
    thread_id: suggestion.entityId,
    suggestion_id: suggestion.id,
    organization_id: ctx.organizationId,
  });
}
