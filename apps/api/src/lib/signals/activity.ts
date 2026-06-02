import { STATUS_LABELS } from "@workspace/schemas/signals";
import { ulid } from "ulid";
import { schema } from "../../live-state/schema";
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

  // schema collection is `update`; ServerDB also exposes deprecated `db.update()`
  // — use db.insert(schema.update, …) so we hit the collection insert path.
  await ctx.db.insert(schema.update, {
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
