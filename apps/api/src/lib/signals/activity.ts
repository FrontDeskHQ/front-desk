import { STATUS_LABELS } from "@workspace/schemas/signals";

import { runRecordActivity } from "../update-mutations";
import type { ExecutionContext } from "./types";

type ActivitySource = "agent_read" | "inline_suggestion" | "autonomous";

export const insertThreadActivity = async (
  ctx: ExecutionContext,
  args: {
    type: string;
    metadata: Record<string, unknown>;
    source: ActivitySource;
  }
): Promise<void> => {
  if (ctx.actorUserId === null) {
    return;
  }

  await runRecordActivity(ctx.db, {
    metadata: {
      ...args.metadata,
      source: args.source,
      userName: ctx.actorUserName,
    },
    organizationId: ctx.organizationId,
    threadId: ctx.threadId,
    type: args.type,
    userId: ctx.actorUserId,
    userName: ctx.actorUserName,
  });
};

export const statusActivityMetadata = (
  oldStatus: number,
  newStatus: number
) => ({
  newStatus,
  newStatusLabel: STATUS_LABELS[newStatus] ?? null,
  oldStatus,
  oldStatusLabel: STATUS_LABELS[oldStatus] ?? null,
});
