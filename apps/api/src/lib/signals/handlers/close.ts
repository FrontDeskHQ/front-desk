import type { CloseAction } from "@workspace/schemas/signals";

import { runSetThreadStatus } from "../../thread-mutations";
import {
  clearCompensateSnapshot,
  getCompensateSnapshot,
  setCompensateSnapshot,
} from "../compensate-snapshots";
import type { ActionHandler } from "../types";

const STATUS_CLOSED = 3;
const snapshotKey = () => "close";

export const closeHandler: ActionHandler<CloseAction> = {
  async apply(_action, ctx) {
    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const previousStatus = thread.status ?? 0;
    if (previousStatus === STATUS_CLOSED) {
      return;
    }

    if (getCompensateSnapshot(ctx, snapshotKey()) === undefined) {
      setCompensateSnapshot(ctx, snapshotKey(), { previousStatus });
    }

    await runSetThreadStatus(
      ctx.db,
      {
        organizationId: ctx.organizationId,
        source: "agent_read",
        status: STATUS_CLOSED,
        threadId: ctx.threadId,
      },
      {
        userId: ctx.actorUserId,
        userName: ctx.actorUserName,
      },
      { preloadedThread: thread }
    );
  },

  async compensate(_action, ctx) {
    const snapshot = getCompensateSnapshot<{ previousStatus: number }>(
      ctx,
      snapshotKey()
    );
    if (!snapshot) {
      return;
    }

    await runSetThreadStatus(
      ctx.db,
      {
        organizationId: ctx.organizationId,
        source: "agent_read",
        status: snapshot.previousStatus,
        threadId: ctx.threadId,
      },
      { userId: null, userName: null }
    );
    clearCompensateSnapshot(ctx, snapshotKey());
  },
};
