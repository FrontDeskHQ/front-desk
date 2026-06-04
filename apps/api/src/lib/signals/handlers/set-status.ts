import type { SetStatusAction } from "@workspace/schemas/signals";
import { insertThreadActivity, statusActivityMetadata } from "../activity";
import {
  clearCompensateSnapshot,
  getCompensateSnapshot,
  setCompensateSnapshot,
} from "../compensate-snapshots";
import type { ActionHandler } from "../types";

const snapshotKey = (action: SetStatusAction) => `set_status:${action.status}`;

export const setStatusHandler: ActionHandler<SetStatusAction> = {
  async apply(action, ctx) {
    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const previousStatus = thread.status ?? 0;
    if (previousStatus === action.status) return;

    // First-write-wins: a repeated status earlier in the same bundle must not
    // overwrite the snapshot, or rollback would restore the intermediate
    // status instead of the original.
    if (getCompensateSnapshot(ctx, snapshotKey(action)) === undefined) {
      setCompensateSnapshot(ctx, snapshotKey(action), { previousStatus });
    }

    await ctx.db.thread.update(ctx.threadId, { status: action.status });

    await insertThreadActivity(ctx, {
      type: "status_changed",
      metadata: statusActivityMetadata(previousStatus, action.status),
      source: "inline_suggestion",
    });
  },

  async compensate(action, ctx) {
    const snapshot = getCompensateSnapshot<{ previousStatus: number }>(
      ctx,
      snapshotKey(action),
    );
    if (!snapshot) return;

    await ctx.db.thread.update(ctx.threadId, {
      status: snapshot.previousStatus,
    });
    clearCompensateSnapshot(ctx, snapshotKey(action));
  },
};
