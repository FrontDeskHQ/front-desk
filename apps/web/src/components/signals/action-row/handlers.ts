// TODO(signals-overhaul issue 10): rewrite against thread.agentRead /
// thread.inlineSuggestions. The suggestion table was dropped in issue 02;
// these handlers are stubbed (no-op) until then.

import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";

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
  summary: string | null;
  createdAt: Date;
  urgencyScore: number;
};

export function acceptStatusSuggestion(
  _suggestion: SuggestionRow & { suggestedStatus: number },
  _thread: Thread | undefined,
  _ctx: ActorContext,
) {}

export function dismissStatusSuggestion(
  _suggestion: SuggestionRow,
  _ctx: ActorContext,
) {}

export function acceptDuplicateSuggestion(
  _suggestion: SuggestionRow & { targetThreadId: string },
  _thread: Thread | undefined,
  _targetThread: Thread | undefined,
  _ctx: ActorContext,
) {}

export function dismissDuplicateSuggestion(
  _suggestion: SuggestionRow & { targetThreadId: string },
  _ctx: ActorContext,
) {}

export function acceptLinkedPrSuggestion(
  _suggestion: SuggestionRow & {
    prId: number;
    prNumber: number;
    repo: string;
  },
  _thread: Thread | undefined,
  _ctx: ActorContext,
) {}

export function dismissLinkedPrSuggestion(
  _suggestion: SuggestionRow & { prNumber: number; repo: string },
  _ctx: ActorContext,
) {}

export function dismissDigestSuggestion(
  _suggestion: SuggestionRow,
  _type: "digest:pending_reply" | "digest:loop_to_close",
  _ctx: ActorContext,
) {}
