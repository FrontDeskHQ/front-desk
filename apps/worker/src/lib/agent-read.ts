import type { Action, ThreadRead } from "@workspace/schemas/signals";
import { fetchClient } from "./database/client";

export const persistAgentRead = async (
  threadId: string,
  agentRead: ThreadRead | null,
): Promise<void> => {
  await fetchClient.mutate.thread.update(threadId, { agentRead });
};

type ExecutionResult = {
  succeeded: Action[];
  failed: { action: Action; error: unknown } | null;
  rolledBack: Action[];
};

const actionsEqual = (a: Action, b: Action): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Mirrors api/src/lib/signals/agent-read.ts for post-auto execution state. */
export const nextAgentReadAfterExecution = (
  read: ThreadRead,
  result: ExecutionResult,
): ThreadRead | null => {
  if (!result.failed) {
    return null;
  }

  if (result.rolledBack.length > 0 && result.succeeded.length === 0) {
    return read;
  }

  const remainingPrimary = read.primary.filter(
    (action) =>
      !result.succeeded.some((succeeded) => actionsEqual(succeeded, action)),
  );

  if (remainingPrimary.length === 0) {
    return null;
  }

  return {
    ...read,
    primary: remainingPrimary,
  };
};
