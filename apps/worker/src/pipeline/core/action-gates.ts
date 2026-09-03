import type { Action, ActionKind } from "@workspace/schemas/signals";

import { replyGate } from "./gates/reply-gate";
import { statusWitnessGate } from "./gates/status-witness";
import type { RunState } from "./run-state";

export interface ActionGateContext {
  run: RunState;
  /** Delivered entity reads already checked by synthesis' trust boundary. */
  verifiedDeliveredEntityUrls?: ReadonlySet<string>;
  /**
   * Bundle siblings that are actually executing, not merely proposed: ungated
   * kinds plus gated ones already admitted this pass. Gated siblings that have
   * not been evaluated yet are deliberately absent — an unevaluated gate is not
   * a promise, and treating it as one is what `GATE_ORDER` exists to prevent.
   */
  autoSiblings: Action[];
}

export type ActionGateResult =
  | {
      allowed: true;
      /** Digest of what this action reported, carried into its receipt. */
      stateFingerprint?: string;
    }
  | { allowed: false; reason: string };

export type ActionGate = (
  action: Action,
  ctx: ActionGateContext
) => Promise<ActionGateResult>;

/**
 * [Action gates](../../../../CONTEXT.md) by kind. A gate asks whether *this
 * instance* has earned autonomous execution — distinct from availability (can
 * it run at all) and autonomy (has the org permitted it), which are properties
 * of the org and thread rather than of the action's content. Unregistered kinds
 * run unconditionally.
 *
 * Two kinds have one. `reply`, whose payload is free-form prose with nothing
 * structural to check (ADR 0013), and `set_status`, which is local and cheap
 * between live statuses but ends a conversation and finishes a linked issue
 * when it crosses into a finished one (ADR 0015). Every other auto-capable kind
 * self-gates on verified evidence.
 */
const ACTION_GATES: Partial<Record<ActionKind, ActionGate>> = {
  reply: replyGate,
  set_status: statusWitnessGate,
};

/**
 * The order gated kinds are evaluated in, so a gate that asks about a sibling
 * asks *after* that sibling's own verdict is known.
 *
 * `set_status` → Resolved requires a reply that is actually sending, so reply
 * must be decided first. Reply's own gate only ever asks about ungated kinds
 * (`link_pr`, `link_issue`), so nothing precedes it. Kinds absent here are
 * ungated and never evaluated.
 */
export const GATE_ORDER: readonly ActionKind[] = ["reply", "set_status"];

export const gateFor = (kind: ActionKind): ActionGate | undefined =>
  ACTION_GATES[kind];

/** Lower sorts earlier; ungated kinds sort last and are never consulted. */
export const gateRank = (kind: ActionKind): number => {
  const index = GATE_ORDER.indexOf(kind);
  return index === -1 ? GATE_ORDER.length : index;
};
