import {
  isFinishedStatus,
  STATUS_RESOLVED,
  WITNESS_JUSTIFIES,
} from "@workspace/schemas/signals";
import type { Action } from "@workspace/schemas/signals";

import type { ActionGate, ActionGateResult } from "../action-gates";

const allow = (): ActionGateResult => ({ allowed: true });
const deny = (reason: string): ActionGateResult => ({
  allowed: false,
  reason,
});

const isGroundedReply = (action: Action): boolean =>
  action.kind === "reply" && action.grounding?.class !== "inferred";

/**
 * The gate on `set_status` — [ADR 0015](../../../../../docs/adr/0015-witness-gated-thread-finishing.md).
 *
 * It guards the *boundary*, not the enum: moves between live statuses sync
 * nothing, tell the customer nothing, and are locally reversible, so they pass
 * unconditionally. Only a move into a finished status has to justify itself.
 */
export const statusWitnessGate: ActionGate = async (action, ctx) => {
  if (action.kind !== "set_status") {
    return allow();
  }

  if (!isFinishedStatus(action.status)) {
    return allow();
  }

  const witness = action.witness;
  if (!witness) {
    return deny("witness_missing");
  }

  const justifies = WITNESS_JUSTIFIES[witness.class];
  if (!justifies.has(action.status)) {
    return deny(`witness_does_not_justify:${witness.class}`);
  }

  // `customer_confirmed` and `entity_settled` both point at something; a class
  // that names no source is indistinguishable from `inferred` at execution.
  if (witness.class !== "abandoned" && witness.sources.length === 0) {
    return deny(`witness_unsourced:${witness.class}`);
  }

  // A structural close is not proof that the customer's request shipped.
  // Declined, duplicate, and ambiguous outcomes always stay human-reviewed.
  if (
    witness.class === "entity_settled" &&
    witness.outcome !== "delivered"
  ) {
    return deny(`entity_outcome_not_delivered:${witness.outcome ?? "missing"}`);
  }

  // Resolving is the one finish the customer is owed a word about: it ends a
  // conversation they still believe is live. `abandoned` → Closed is exempt —
  // there is nobody left to tell, and a "closing for inactivity" note is a
  // product decision, not a gate precondition.
  if (action.status === STATUS_RESOLVED) {
    const sendingReply = ctx.autoSiblings.some(isGroundedReply);
    if (!sendingReply) {
      return deny("resolve_without_reply");
    }
  }

  return allow();
};
