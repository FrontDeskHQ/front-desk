import type { MarkDuplicateAction } from "@workspace/schemas/signals";

import { runMarkDuplicate } from "../../thread-mutations";
import {
  clearCompensateSnapshot,
  getCompensateSnapshot,
  setCompensateSnapshot,
} from "../compensate-snapshots";
import type { ActionHandler } from "../types";

const snapshotKey = (action: MarkDuplicateAction) =>
  `mark_duplicate:${action.targetThreadId}`;

export const markDuplicateHandler: ActionHandler<MarkDuplicateAction> = {
  async apply(action, ctx) {
    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const previousStatus = thread.status ?? 0;
    // First-write-wins: a repeated mark_duplicate for the same target earlier in
    // the bundle has already moved the status to DUPLICATED, so re-snapshotting
    // would capture that intermediate value and corrupt rollback.
    if (getCompensateSnapshot(ctx, snapshotKey(action)) === undefined) {
      setCompensateSnapshot(ctx, snapshotKey(action), { previousStatus });
    }

    await runMarkDuplicate(
      ctx.db,
      {
        duplicateOfThreadId: action.targetThreadId,
        organizationId: ctx.organizationId,
        source: ctx.actorUserId ? "agent_read" : "autonomous",
        threadId: ctx.threadId,
      },
      {
        userId: ctx.actorUserId,
        userName: ctx.actorUserName,
      },
      { preloadedThread: thread }
    );
  },

  async compensate(action, ctx) {
    const snapshot = getCompensateSnapshot<{ previousStatus: number }>(
      ctx,
      snapshotKey(action)
    );
    if (!snapshot) {
      return;
    }

    await ctx.db.thread.update(ctx.threadId, {
      status: snapshot.previousStatus,
    });
    clearCompensateSnapshot(ctx, snapshotKey(action));
  },
};
