import type { ApplyLabelAction } from "@workspace/schemas/signals";
import { ulid } from "ulid";
import {
  clearCompensateSnapshot,
  getCompensateSnapshot,
  setCompensateSnapshot,
} from "../compensate-snapshots";
import { insertThreadActivity } from "../activity";
import type { ActionHandler } from "../types";

const snapshotKey = (action: ApplyLabelAction) => `apply_label:${action.labelId}`;

export const applyLabelHandler: ActionHandler<ApplyLabelAction> = {
  async apply(action, ctx) {
    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const label = await ctx.db.label.one(action.labelId).get();
    if (!label || label.organizationId !== ctx.organizationId) {
      throw new Error("LABEL_NOT_FOUND");
    }

    const existing = await ctx.db.threadLabel
      .first({
        threadId: ctx.threadId,
        labelId: action.labelId,
      })
      .get();

    if (existing?.enabled) {
      return;
    }

    let threadLabelId = existing?.id;

    if (existing) {
      await ctx.db.threadLabel.update(existing.id, { enabled: true });
    } else {
      threadLabelId = ulid().toLowerCase();
      await ctx.db.threadLabel.insert({
        id: threadLabelId,
        threadId: ctx.threadId,
        labelId: action.labelId,
        enabled: true,
      });
    }

    setCompensateSnapshot(ctx, snapshotKey(action), {
      threadLabelId: threadLabelId!,
      hadEnabled: existing?.enabled ?? false,
    });

    await insertThreadActivity(ctx, {
      type: "label_changed",
      metadata: {
        action: "added",
        labelId: action.labelId,
        labelName: label.name,
      },
      source: "inline_suggestion",
    });
  },

  async compensate(action, ctx) {
    const snapshot = getCompensateSnapshot<{
      threadLabelId: string;
      hadEnabled: boolean;
    }>(ctx, snapshotKey(action));
    if (!snapshot) return;

    if (snapshot.hadEnabled) {
      await ctx.db.threadLabel.update(snapshot.threadLabelId, {
        enabled: false,
      });
    } else {
      await ctx.db.threadLabel.update(snapshot.threadLabelId, {
        enabled: false,
      });
    }

    clearCompensateSnapshot(ctx, snapshotKey(action));
  },
};
