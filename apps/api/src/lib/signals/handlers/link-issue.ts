import type { LinkIssueAction } from "@workspace/schemas/signals";

import { schema } from "../../../live-state/schema";
import {
  clearCompensateSnapshot,
  getCompensateSnapshot,
  setCompensateSnapshot,
} from "../compensate-snapshots";
import type { ActionHandler } from "../types";

const snapshotKey = (action: LinkIssueAction) =>
  `link_issue:${action.issueUrl}`;

/**
 * Point the thread at an already-mirrored issue.
 *
 * Deliberately *not* a mirror of `link_pr`: this writes `thread.externalIssueId`
 * and stops. No `issue-tracker` capability method is invoked and nothing is
 * posted upstream, which is what makes the action reversible — restoring the
 * previous id fully undoes it. The human `thread.linkIssue` mutation is silent
 * in the same way and stays unchanged.
 */
export const linkIssueHandler: ActionHandler<LinkIssueAction> = {
  async apply(action, ctx) {
    const thread = await ctx.db.thread
      .first({ id: ctx.threadId, organizationId: ctx.organizationId })
      .get();
    if (!thread) {
      throw new Error("THREAD_NOT_FOUND");
    }

    // The issue must already be mirrored: the mirror row owns the canonical
    // `externalKey` the thread stores. We match on the URL the action carries;
    // core never parses the provider's URL.
    const entity = Object.values(
      await ctx.db.find(schema.externalEntity, {
        where: {
          deletedAt: null,
          organizationId: ctx.organizationId,
          type: "issue",
          url: action.issueUrl,
        },
      })
    )[0];
    if (!entity) {
      throw new Error("LINK_ISSUE_ENTITY_NOT_MIRRORED");
    }

    // Already linked to this issue — no-op, mirroring the manual link mutation.
    if (thread.externalIssueId === entity.externalKey) {
      return;
    }

    // First-write-wins, as in `mark_duplicate`: a repeated link for the same
    // issue earlier in the bundle already moved the field, so re-snapshotting
    // would capture that intermediate value and corrupt rollback.
    if (getCompensateSnapshot(ctx, snapshotKey(action)) === undefined) {
      setCompensateSnapshot(ctx, snapshotKey(action), {
        previousIssueId: thread.externalIssueId ?? null,
      });
    }

    await ctx.db.thread.update(ctx.threadId, {
      externalIssueId: entity.externalKey,
    });
  },

  async compensate(action, ctx) {
    const snapshot = getCompensateSnapshot<{ previousIssueId: string | null }>(
      ctx,
      snapshotKey(action)
    );
    if (!snapshot) {
      return;
    }

    await ctx.db.thread.update(ctx.threadId, {
      externalIssueId: snapshot.previousIssueId,
    });
    clearCompensateSnapshot(ctx, snapshotKey(action));
  },
};
