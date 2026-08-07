import type { ActionAvailability } from "@workspace/schemas/signals";
import { log } from "@workspace/utils/logging";

import { fetchClient } from "./database/client";
import { errorFields } from "./logging";

/**
 * Nothing available — the fallback when availability can't be resolved. A
 * transient API failure must not let synthesis propose a move that then fails
 * at execution; skipping the offer for one run is the cheaper mistake.
 */
const NONE: ActionAvailability = { create_issue: false };

/**
 * Resolve [action availability](../../../CONTEXT.md) for this run — what can
 * actually execute — before synthesis, so the prompt and the output schema can
 * be shaped by it.
 *
 * Two narrowings, both required. The org's configuration answers whether it
 * *can* file at all; the thread answers whether filing again is meaningful. A
 * thread links a single issue, so `create_issue` against an already-linked
 * thread is refused at execution (`ALREADY_LINKED`). Without the thread check
 * synthesis keeps the verb in its vocabulary with nothing to argue it down —
 * the `related_issues` hint is *cleared* once a thread links an issue, so an
 * empty hint bag reads as "no existing issue covers this" — and re-offers a
 * file that can only ever error. `link_issue` is deliberately not narrowed:
 * re-linking a thread to a *different* issue is a legal move.
 *
 * This is not autonomy: autonomy is whether the org has *permitted* the Agent,
 * applied afterwards by the autonomy stage. Keeping them apart matters twice
 * over — an unavailable action is not the org choosing `off`, and folding
 * availability into autonomy would still spend the whole read before discarding
 * it.
 */
export async function resolveActionAvailability(args: {
  organizationId: string;
  threadHasLinkedIssue: boolean;
}): Promise<ActionAvailability> {
  // Nothing else is availability-gated yet, so a linked thread short-circuits
  // the round trip entirely.
  if (args.threadHasLinkedIssue) {
    return NONE;
  }

  try {
    return await fetchClient.query.organization.actionAvailability({
      organizationId: args.organizationId,
    });
  } catch (error) {
    log.error({
      action: "worker.action_availability",
      event: "resolve_failed",
      organizationId: args.organizationId,
      error: errorFields(error),
      outcome: "treated_as_unavailable",
    });
    return NONE;
  }
}
