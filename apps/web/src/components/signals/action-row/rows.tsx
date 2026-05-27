// TODO(signals-overhaul issue 10): rewrite against thread.agentRead /
// thread.inlineSuggestions. The suggestion table was dropped in issue 02;
// these row components are stubbed (render null) until then.

import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";
import type { ActorContext, SuggestionRow } from "./handlers";

type ThreadWithRels = InferLiveObject<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

export type SignalRowProps = {
  suggestion: SuggestionRow;
  threadsMap: Map<string, ThreadWithRels>;
  ctx: ActorContext;
};

export function StatusActionRow(_props: SignalRowProps) {
  return null;
}

export function DuplicateActionRow(_props: SignalRowProps) {
  return null;
}

export function LinkedPrActionRow(_props: SignalRowProps) {
  return null;
}

export function PendingReplyActionRow(_props: SignalRowProps) {
  return null;
}

export function LoopToCloseActionRow(_props: SignalRowProps) {
  return null;
}

export function canRenderSuggestion(_s: SuggestionRow): boolean {
  return false;
}
