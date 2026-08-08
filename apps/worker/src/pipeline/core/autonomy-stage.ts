import { nextAgentReadAfterExecution } from "@workspace/schemas/signals";
import type {
  Action,
  ActionKind,
  AutonomyLevel,
  ThreadRead,
} from "@workspace/schemas/signals";
import { log } from "@workspace/utils/logging";

import { errorFields } from "../../lib/logging";
import type { RunState } from "./run-state";

const keepForRead = (
  action: Action,
  autonomy: Record<ActionKind, AutonomyLevel>
) => autonomy[action.kind] !== "off";

/**
 * The [autonomy stage](../../../../CONTEXT.md) for synthesis: applies the org's
 * per-kind policy to a raw action set, auto-executes the primary actions set to
 * `auto`, then persists the resulting [thread read](../../../../CONTEXT.md) (or
 * null when no substantive move remains).
 *
 * A free function over {@link RunState} rather than a method on it: this is
 * policy, not state. Keeping it outside the handle is also what lets it move
 * behind the API seam later without dragging the rest of the run's state along.
 */
export const applySynthesisAutonomy = async (
  run: RunState,
  rawActionSet: ThreadRead | null
): Promise<ThreadRead | null> => {
  if (!rawActionSet) {
    await run.publishRead(null);
    return null;
  }

  const autonomy = await run.autonomy();

  const primary = rawActionSet.primary.filter((action) =>
    keepForRead(action, autonomy)
  );
  const alternatives = (rawActionSet.alternatives ?? []).filter((action) =>
    keepForRead(action, autonomy)
  );

  if (primary.length === 0) {
    await run.publishRead(null);
    return null;
  }

  const filteredRead: ThreadRead = {
    ...rawActionSet,
    alternatives,
    primary,
  };

  const autoActions = primary.filter(
    (action) => autonomy[action.kind] === "auto"
  );
  const suggestPrimary = primary.filter(
    (action) => autonomy[action.kind] === "suggest"
  );

  let finalPrimary = suggestPrimary;

  if (autoActions.length > 0) {
    try {
      const result = await run.executeBundle(autoActions);

      const afterAuto = nextAgentReadAfterExecution(
        { ...filteredRead, primary: autoActions },
        result
      );

      if (afterAuto?.primary.length) {
        finalPrimary = [...afterAuto.primary, ...suggestPrimary];
      }
    } catch (error) {
      // TODO(idempotency): On an RPC/transport error we don't know whether the
      // server actually executed the bundle, so re-suggesting `autoActions` here
      // can replay non-idempotent actions (e.g. a duplicate reply) if it did.
      // Give execution idempotency keys so a retry/re-suggest is a safe no-op
      // when the original call already succeeded.
      log.error({
        action: "worker.synthesis_autonomy",
        event: "autonomous_bundle_failed",
        organizationId: run.organizationId,
        threadId: run.threadId,
        autoActionCount: autoActions.length,
        error: errorFields(error),
        outcome: "auto_actions_retained_for_review",
      });
      finalPrimary = [...autoActions, ...suggestPrimary];
    }
  }

  if (finalPrimary.length === 0) {
    await run.publishRead(null);
    return null;
  }

  const agentRead: ThreadRead = {
    ...filteredRead,
    primary: finalPrimary,
  };

  await run.publishRead(agentRead);
  return agentRead;
};
