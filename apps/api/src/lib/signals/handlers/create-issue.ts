import type { CreateIssueAction } from "@workspace/schemas/signals";

import { schema } from "../../../live-state/schema";
import { errors } from "../../errors";
import {
  resolveEffectiveDefaultIssueTarget,
  runCreateIssue,
} from "../../issue-tracker";
import type { ActionHandler } from "../types";

/**
 * File a new external issue and link it to the thread — one atomic handler,
 * non-reversible.
 *
 * The human path is client-orchestrated (`thread.createIssue` returns the
 * entity and the browser calls `thread.linkIssue`). The Agent has no browser on
 * either the `auto` (worker) or accept (API) path, so creating and linking must
 * happen together here. That is also why synthesis may never bundle
 * `create_issue` with `link_issue`: the created issue's id would have to flow
 * from one executed step into the next, which ADR 0003's executor deliberately
 * cannot do.
 *
 * Refuses when the thread already links an issue, so a stale read replayed
 * against a since-linked thread cannot mint a second issue.
 */
export const createIssueHandler: ActionHandler<CreateIssueAction> = {
  async apply(action, ctx) {
    const thread = await ctx.db.thread
      .first({ id: ctx.threadId, organizationId: ctx.organizationId })
      .get();
    if (!thread) {
      throw errors.notFound("thread");
    }
    if (thread.externalIssueId) {
      throw errors.conflict(
        "ALREADY_LINKED",
        "This thread is already linked to an issue"
      );
    }

    const organization = Object.values(
      await ctx.db.find(schema.organization, {
        where: { id: ctx.organizationId },
      })
    )[0];
    if (!organization) {
      throw errors.notFound("organization");
    }

    // The Agent never picks a destination. `auto` mode gets the org's default
    // issue target (or the first available target when unset); on the accept
    // path a human may redirect it from the card, which arrives as the override.
    const target =
      ctx.issueTarget ??
      (await resolveEffectiveDefaultIssueTarget(
        ctx.db,
        ctx.organizationId,
        organization.settings
      ));
    if (!target) {
      throw errors.preconditionFailed(
        "DEFAULT_ISSUE_TARGET_NOT_CONFIGURED",
        "No issue target is configured. Connect a repository in Integrations settings."
      );
    }

    const entity = await runCreateIssue(ctx.db, {
      actorUserId: ctx.actorUserId,
      actorUserName: ctx.actorUserName,
      body: action.body,
      integrationId: target.integrationId,
      organizationId: ctx.organizationId,
      target: target.target,
      threadId: ctx.threadId,
      title: action.title,
    });

    // Link from the entity the connector just returned. The mirror row for this
    // issue arrives later via the provider's webhook, so we cannot look it up
    // here — `entity.id` is the same provider-scoped external key the mirror
    // will carry.
    await ctx.db.thread.update(ctx.threadId, {
      externalIssueId: entity.id,
    });
  },
};
