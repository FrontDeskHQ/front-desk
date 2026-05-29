import type { CloseAction } from "@workspace/schemas/signals";
import { insertThreadActivity, statusActivityMetadata } from "../activity";
import type { ActionHandler } from "../types";

const STATUS_CLOSED = 3;

export const closeHandler: ActionHandler<CloseAction> = {
  async apply(_action, ctx) {
    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const previousStatus = thread.status ?? 0;
    if (previousStatus === STATUS_CLOSED) return;

    await ctx.db.thread.update(ctx.threadId, { status: STATUS_CLOSED });

    await insertThreadActivity(ctx, {
      type: "status_changed",
      metadata: statusActivityMetadata(previousStatus, STATUS_CLOSED),
      source: "agent_read",
    });
  },
};
