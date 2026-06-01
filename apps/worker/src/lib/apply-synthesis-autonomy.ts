import type { Action, ThreadRead } from "@workspace/schemas/signals";
import {
  nextAgentReadAfterExecution,
  persistAgentRead,
} from "./agent-read";
import { getOrgActionAutonomy } from "./autonomy";
import { fetchClient } from "./database/client";

const keepForRead = (action: Action, autonomy: Awaited<ReturnType<typeof getOrgActionAutonomy>>) =>
  autonomy[action.kind] !== "off";

/**
 * Applies org action-autonomy policy to a synthesis raw action set, optionally
 * auto-executes primary actions configured as `auto`, then persists
 * `thread.agentRead` (or null when no substantive move remains).
 */
export const applySynthesisAutonomy = async (
  threadId: string,
  organizationId: string,
  rawActionSet: ThreadRead | null,
): Promise<ThreadRead | null> => {
  if (!rawActionSet) {
    await persistAgentRead(threadId, null);
    return null;
  }

  const autonomy = await getOrgActionAutonomy(organizationId);

  const primary = rawActionSet.primary.filter((action) =>
    keepForRead(action, autonomy),
  );
  const alternatives = (rawActionSet.alternatives ?? []).filter((action) =>
    keepForRead(action, autonomy),
  );

  if (primary.length === 0) {
    await persistAgentRead(threadId, null);
    return null;
  }

  const filteredRead: ThreadRead = {
    ...rawActionSet,
    primary,
    alternatives,
  };

  const autoActions = primary.filter((action) => autonomy[action.kind] === "auto");
  const suggestPrimary = primary.filter(
    (action) => autonomy[action.kind] === "suggest",
  );

  let finalPrimary = suggestPrimary;

  if (autoActions.length > 0) {
    try {
      const result = await fetchClient.mutate.thread.executeAutonomousBundle({
        threadId,
        organizationId,
        actions: autoActions,
      });

      const afterAuto = nextAgentReadAfterExecution(
        { ...filteredRead, primary: autoActions },
        result,
      );

      if (afterAuto?.primary.length) {
        finalPrimary = [...afterAuto.primary, ...suggestPrimary];
      }
    } catch (error) {
      console.error(
        `Autonomous bundle failed for thread ${threadId}; keeping auto actions in read:`,
        error,
      );
      finalPrimary = [...autoActions, ...suggestPrimary];
    }
  }

  if (finalPrimary.length === 0) {
    await persistAgentRead(threadId, null);
    return null;
  }

  const agentRead: ThreadRead = {
    ...filteredRead,
    primary: finalPrimary,
  };

  await persistAgentRead(threadId, agentRead);
  return agentRead;
};
