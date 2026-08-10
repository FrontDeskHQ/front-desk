import type { Action, ActionKind } from "@workspace/schemas/signals";

import { replyGroundingGate } from "./gates/reply-grounding";
import type { RunState } from "./run-state";

export interface ActionGateContext {
  run: RunState;
  /** Bundle siblings that are actually executing, not merely proposed. */
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
 * Only `reply` has one: every other auto-capable kind self-gates on verified
 * evidence, whereas a reply's payload is free-form prose with nothing
 * structural to check.
 */
const ACTION_GATES: Partial<Record<ActionKind, ActionGate>> = {
  reply: replyGroundingGate,
};

export const gateFor = (kind: ActionKind): ActionGate | undefined =>
  ACTION_GATES[kind];
