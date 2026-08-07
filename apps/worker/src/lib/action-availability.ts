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
 * Resolve the org's [action availability](../../../CONTEXT.md) — what it is
 * *able* to do — before synthesis runs, so the prompt and the output schema can
 * be shaped by it.
 *
 * This is not autonomy: autonomy is whether the org has *permitted* the Agent,
 * applied afterwards by the autonomy stage. Keeping them apart matters twice
 * over — an unavailable action is not the org choosing `off`, and folding
 * availability into autonomy would still spend the whole read before discarding
 * it.
 */
export async function getOrgActionAvailability(
  organizationId: string
): Promise<ActionAvailability> {
  try {
    return await fetchClient.query.organization.actionAvailability({
      organizationId,
    });
  } catch (error) {
    log.error({
      action: "worker.action_availability",
      event: "resolve_failed",
      organizationId,
      error: errorFields(error),
      outcome: "treated_as_unavailable",
    });
    return NONE;
  }
}
