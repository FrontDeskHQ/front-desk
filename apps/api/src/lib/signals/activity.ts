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
  },
): Promise<void> => {
  if (ctx.actorUserId === null) return;

  await runRecordActivity(ctx.db, {
    threadId: ctx.threadId,
    organizationId: ctx.organizationId,
    userId: ctx.actorUserId,
    userName: ctx.actorUserName,
    type: args.type,
    metadata: {
      ...args.metadata,
      source: args.source,
    },
  });
};

export const statusActivityMetadata = (
  oldStatus: number,
  newStatus: number,
) => ({
  oldStatus,
  newStatus,
  oldStatusLabel: STATUS_LABELS[oldStatus] ?? null,
  newStatusLabel: STATUS_LABELS[newStatus] ?? null,
});
