import type { ApplyLabelAction } from "@workspace/schemas/signals";
import { runAttachLabelToThread } from "../../label-mutations";
import { insertThreadActivity } from "../activity";
import {
  clearCompensateSnapshot,
  getCompensateSnapshot,
  setCompensateSnapshot,
} from "../compensate-snapshots";
import type { ActionHandler } from "../types";

const snapshotKey = (action: ApplyLabelAction) =>
  `apply_label:${action.labelId}`;

export const applyLabelHandler: ActionHandler<ApplyLabelAction> = {
  async apply(action, ctx) {
    const result = await runAttachLabelToThread(ctx.db, {
      threadId: ctx.threadId,
      labelId: action.labelId,
      organizationId: ctx.organizationId,
    });

    if (result.noOp) {
      return;
    }

    setCompensateSnapshot(ctx, snapshotKey(action), {
      threadLabelId: result.threadLabelId,
      hadEnabled: false,
    });

    await insertThreadActivity(ctx, {
      type: "label_changed",
      metadata: {
        action: "added",
        labelId: action.labelId,
        labelName: result.label.name,
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

    // A snapshot only exists when the label was newly enabled by this action
    // (the handler returns early on a no-op), so compensation always disables it.
    await ctx.db.threadLabel.update(snapshot.threadLabelId, {
      enabled: false,
    });

    clearCompensateSnapshot(ctx, snapshotKey(action));
  },
};
