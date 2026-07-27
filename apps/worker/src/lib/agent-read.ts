import type { ThreadRead } from "@workspace/schemas/signals";

import { fetchClient } from "./database/client";

// Post-execution agent-read state is computed by the shared
// `nextAgentReadAfterExecution` in @workspace/schemas/signals so the worker
// (autonomous) and API (human accept) paths can't drift.
export { nextAgentReadAfterExecution } from "@workspace/schemas/signals";

export const persistAgentRead = async (
  threadId: string,
  organizationId: string,
  agentRead: ThreadRead | null
): Promise<void> => {
  await fetchClient.mutate.thread.setAgentRead({
    agentRead,
    organizationId,
    threadId,
  });
};
