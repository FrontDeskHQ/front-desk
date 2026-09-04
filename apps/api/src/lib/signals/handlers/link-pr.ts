import { invokeCapability } from "@connectors/framework";
import type { LinkPrAction } from "@workspace/schemas/signals";

import { schema } from "../../../live-state/schema";
import {
  buildEntityRef,
  resolveEntityCapabilityTarget,
} from "../../capability-dispatch";
import { connectorInvokeSecret } from "../../connector-registry";
import { buildWorkspaceThreadUrl } from "../../thread-url";
import { runRecordActivity } from "../../update-mutations";
import type { ActionHandler } from "../types";

export const linkPrHandler: ActionHandler<LinkPrAction> = {
  async apply(action, ctx) {
    const thread = await ctx.db.thread
      .first({ id: ctx.threadId, organizationId: ctx.organizationId })
      .get();
    if (!thread) {
      throw new Error("THREAD_NOT_FOUND");
    }

    // The PR must already be mirrored — that mirrored entity is what routes the
    // dispatch to its owning integration (routing-by-target). We match on the
    // canonical URL the action carries; core never parses the provider's URL.
    const entity = Object.values(
      await ctx.db.find(schema.externalEntity, {
        where: {
          deletedAt: null,
          organizationId: ctx.organizationId,
          type: "pull_request",
          url: action.prUrl,
        },
      })
    )[0];
    if (!entity) {
      throw new Error("LINK_PR_ENTITY_NOT_MIRRORED");
    }

    // Already linked to this PR — no-op, mirroring the manual link mutation.
    // Guards a retry/replay from re-posting the back-reference comment.
    if (thread.externalPrId === entity.externalKey) {
      return;
    }

    const target = await resolveEntityCapabilityTarget(
      ctx.db,
      ctx.organizationId,
      entity,
      "pr-tracker"
    );
    if (!target) {
      throw new Error("PR_TRACKER_NOT_CONFIGURED");
    }

    const threadUrl = buildWorkspaceThreadUrl(
      process.env.BASE_FRONTEND_URL ?? "http://localhost:3000",
      ctx.threadId
    );

    // Post the back-reference on the PR before recording the link locally, so a
    // failed comment doesn't leave a link with no trace on the external side.
    await invokeCapability(
      target.entry.invokeUrl,
      {
        capability: "pr-tracker",
        config: target.integration.configStr,
        method: "link",
        payload: {
          entity: buildEntityRef(entity),
          thread: { title: thread.name, url: threadUrl },
        },
      },
      { secret: connectorInvokeSecret }
    );

    const oldPrId = thread.externalPrId ?? null;
    await ctx.db.thread.update(ctx.threadId, {
      externalPrId: entity.externalKey,
    });

    const newPrLabel = `${entity.repoFullName}#${entity.number}`;
    await runRecordActivity(ctx.db, {
      metadata: {
        newPrId: entity.externalKey,
        newPrLabel,
        oldPrId,
        oldPrLabel: null,
      },
      organizationId: ctx.organizationId,
      threadId: ctx.threadId,
      type: "pr_changed",
      userId: ctx.actorUserId,
      userName: ctx.actorUserName,
    });
  },
};
