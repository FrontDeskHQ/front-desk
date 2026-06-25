import {
  type Action,
  type AutonomousActionMetadata,
  isReversible,
} from "@workspace/schemas/signals";
import { runRecordAutonomousAction } from "../autonomous-action-mutations";
import { getCompensateSnapshot } from "./compensate-snapshots";
import type { ExecutionContext } from "./types";

const buildMetadata = (
  action: Action,
  ctx: ExecutionContext,
): AutonomousActionMetadata | null => {
  if (action.kind === "apply_label") {
    // Only record a receipt when the label was actually applied. The handler
    // skips writing a snapshot when the label was already enabled (a no-op), so
    // a missing snapshot means undo would otherwise remove a pre-existing label.
    const snapshot = getCompensateSnapshot<{
      threadLabelId: string;
      hadEnabled: boolean;
    }>(ctx, `apply_label:${action.labelId}`);
    if (!snapshot) return null;
    return { kind: "apply_label", labelId: action.labelId };
  }

  if (action.kind === "set_status") {
    const snapshot = getCompensateSnapshot<{ previousStatus: number }>(
      ctx,
      `set_status:${action.status}`,
    );
    if (!snapshot) return null;
    return { kind: "set_status", previousStatus: snapshot.previousStatus };
  }

  if (action.kind === "mark_duplicate") {
    const snapshot = getCompensateSnapshot<{ previousStatus: number }>(
      ctx,
      `mark_duplicate:${action.targetThreadId}`,
    );
    if (!snapshot) return null;
    return {
      kind: "mark_duplicate",
      relatedThreadId: action.targetThreadId,
      score: null,
      previousStatus: snapshot.previousStatus,
    };
  }

  return null;
};

export const recordAutonomousReceipts = async (
  ctx: ExecutionContext,
  succeeded: Action[],
): Promise<void> => {
  for (const action of succeeded) {
    if (!isReversible(action)) continue;

    const metadata = buildMetadata(action, ctx);
    if (!metadata) continue;

    await runRecordAutonomousAction(ctx.db, {
      organizationId: ctx.organizationId,
      actionKind: action.kind,
      entityId: ctx.threadId,
      metadata,
    });
  }
};
