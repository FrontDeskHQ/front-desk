import type { SetStatusAction } from "@workspace/schemas/signals";

import { runSetThreadStatus } from "../../thread-mutations";
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
    if (previousStatus === action.status) {
      return;
    }

    // First-write-wins: a repeated status earlier in the same bundle must not
    // overwrite the snapshot, or rollback would restore the intermediate
    // status instead of the original.
    if (getCompensateSnapshot(ctx, snapshotKey(action)) === undefined) {
      setCompensateSnapshot(ctx, snapshotKey(action), { previousStatus });
    }

    await runSetThreadStatus(
      ctx.db,
      {
        organizationId: ctx.organizationId,
        // `set_status` is a synthesis action since ADR 0014 and reaches here
        // from a thread read, an accepted suggestion, or an autonomous bundle.
        // The old hardcoded "inline_suggestion" is a false provenance in two of
        // those three; branch on the actor the way mark_duplicate does.
        source: ctx.actorUserId ? "agent_read" : "autonomous",
        status: action.status,
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
