import type { MarkDuplicateAction } from "@workspace/schemas/signals";
import { insertThreadActivity } from "../activity";
import {
  clearCompensateSnapshot,
  getCompensateSnapshot,
  setCompensateSnapshot,
} from "../compensate-snapshots";
import type { ActionHandler } from "../types";

const STATUS_DUPLICATED = 4;

const snapshotKey = (action: MarkDuplicateAction) =>
  `mark_duplicate:${action.targetThreadId}`;

export const markDuplicateHandler: ActionHandler<MarkDuplicateAction> = {
  async apply(action, ctx) {
    if (action.targetThreadId === ctx.threadId) {
      throw new Error("CANNOT_MARK_DUPLICATE_OF_SELF");
    }

    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const target = await ctx.db.thread.one(action.targetThreadId).get();
    if (!target || target.organizationId !== ctx.organizationId) {
      throw new Error("TARGET_THREAD_NOT_FOUND");
    }

    const previousStatus = thread.status ?? 0;
    // First-write-wins: a repeated mark_duplicate for the same target earlier in
    // the bundle has already moved the status to DUPLICATED, so re-snapshotting
    // would capture that intermediate value and corrupt rollback.
    if (getCompensateSnapshot(ctx, snapshotKey(action)) === undefined) {
      setCompensateSnapshot(ctx, snapshotKey(action), { previousStatus });
    }

    await ctx.db.thread.update(ctx.threadId, { status: STATUS_DUPLICATED });

    await insertThreadActivity(ctx, {
      type: "marked_duplicate",
      metadata: {
        duplicateOfThreadId: action.targetThreadId,
        duplicateOfThreadName: target.name,
      },
      source: ctx.actorUserId ? "agent_read" : "autonomous",
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
