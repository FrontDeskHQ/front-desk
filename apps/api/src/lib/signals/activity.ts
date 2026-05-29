import { STATUS_LABELS } from "@workspace/schemas/signals";
import { ulid } from "ulid";
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

  await ctx.db.update.insert({
    id: ulid().toLowerCase(),
    threadId: ctx.threadId,
    userId: ctx.actorUserId,
    type: args.type,
    createdAt: new Date(),
    metadataStr: JSON.stringify({
      ...args.metadata,
      source: args.source,
      userName: ctx.actorUserName,
    }),
    replicatedStr: JSON.stringify({}),
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
