import { statusValues } from "@workspace/ui/components/indicator";
import {
  buildIssueFields,
  buildPullRequestFields,
  type ExternalEntityFields,
  upsertExternalEntity,
} from "../lib/external-entity";
import { app } from "../lib/github";
import { fetchClient, store } from "../lib/live-state";
import { enqueuePrMatch } from "../lib/queue";
import { STATUS_CLOSED, STATUS_OPEN, STATUS_RESOLVED } from "../utils";

/**
 * Pull-request actions that warrant a push-side thread match (FRO-205): the PR
 * became newly matchable — opened, reopened, undrafted, or its title/body was
 * edited. Deliberately excludes `synchronize` (new commits don't change the
 * semantic content we match on) and close/draft transitions (those make it
 * ineligible). A draft PR is filtered out again below by the eligibility check.
 */
const PR_MATCH_ACTIONS = new Set([
  "opened",
  "reopened",
  "ready_for_review",
  "edited",
]);

/**
 * Resolve the FrontDesk organization that owns a GitHub installation by
 * matching the `installationId` persisted in the github integration config
 * (see `routes/setup.ts`). Integrations are loaded into the live-state store,
 * so this is an in-memory lookup.
 */
const resolveOrganizationId = (
  installationId: number | undefined
): string | null => {
  if (!installationId) return null;

  const integrations = store.query.integration.where({ type: "github" }).get();

  for (const integration of integrations) {
    if (!integration.configStr) continue;
    try {
      const config = JSON.parse(integration.configStr);
      if (config.installationId === installationId) {
        return integration.organizationId;
      }
    } catch {
      // Ignore malformed config; other integrations may still match.
    }
  }

  return null;
};

/**
 * Read the installation id from a webhook payload. Typed loosely because the
 * octokit event unions don't expose `installation` uniformly across actions.
 */
const installationIdOf = (payload: unknown): number | undefined =>
  (payload as { installation?: { id?: number } | null }).installation?.id;

/**
 * Reaction to the mirror moving into a closed/merged state: resolve any
 * FrontDesk threads linked to the issue/PR. This is the only bespoke behaviour
 * the integration still layers on top of the mirror upsert. Status changes are
 * marked `replicatedStr: { github: true }` so they don't sync back to GitHub.
 */
const resolveLinkedThreads = (
  fields: ExternalEntityFields,
  meta: { merged?: boolean }
) => {
  const linkedThreads =
    fields.type === "issue"
      ? store.query.thread.where({ externalIssueId: fields.externalKey }).get()
      : store.query.thread.where({ externalPrId: fields.externalKey }).get();

  if (linkedThreads.length === 0) {
    console.log(
      `[GitHub] No threads linked to ${fields.type} ${fields.externalKey}`
    );
    return;
  }

  for (const thread of linkedThreads) {
    if (
      thread.status === STATUS_RESOLVED ||
      thread.status === STATUS_CLOSED
    ) {
      console.log(
        `[GitHub] Thread ${thread.id} already ${statusValues[thread.status]?.label}, skipping status update`
      );
      continue;
    }

    const oldStatus = thread.status ?? STATUS_OPEN;
    const newStatus = STATUS_RESOLVED;

    console.log(
      `[GitHub] Updating thread ${thread.id} status from ${statusValues[oldStatus]?.label} to ${statusValues[newStatus]?.label}`
    );

    store.mutate.thread.setStatus({
      threadId: thread.id,
      organizationId: thread.organizationId,
      status: newStatus,
      source: "github",
      userName: "GitHub Integration",
      recordActivity: true,
      activityMetadata: {
        repoFullName: fields.repoFullName,
        ...(fields.type === "issue"
          ? { issueNumber: fields.number }
          : { prNumber: fields.number, merged: meta.merged }),
      },
      replicatedStr: JSON.stringify({ github: true }),
    });
  }
};

/**
 * Build a `RepoRef` from a webhook `repository` payload.
 */
const repoRefFromWebhook = (repository: {
  owner: { login: string };
  name: string;
  full_name: string;
}) => ({
  owner: repository.owner.login,
  name: repository.name,
  fullName: repository.full_name,
});

export const setupWebhooks = () => {
  // Keep the mirror current on every issue-mutating event. `deleted` and
  // `transferred` (transfer-out) soft-delete the source row; `closed` resolves
  // linked threads as a reaction to the mirror change.
  app.webhooks.on("issues", async ({ payload }) => {
    try {
      const action = payload.action;
      const organizationId = resolveOrganizationId(installationIdOf(payload));

      if (!organizationId) {
        console.warn(
          `[GitHub] No organization for installation ${installationIdOf(payload)}, skipping issues.${action}`
        );
        return;
      }

      const fields = buildIssueFields(
        payload.issue,
        repoRefFromWebhook(payload.repository)
      );

      if (action === "deleted" || action === "transferred") {
        await fetchClient.mutate.externalEntity.softDelete({
          organizationId,
          externalKey: fields.externalKey,
        });
        return;
      }

      await upsertExternalEntity(organizationId, fields);

      if (action === "closed") {
        resolveLinkedThreads(fields, {});
      }
    } catch (error) {
      console.error("[GitHub] Error handling issues webhook:", error);
    }
  });

  // Keep the mirror current on every pull-request-mutating event. `closed`
  // (merged or not) resolves linked threads.
  //
  // NOTE: resolves the `pr_matched` TODO context — the mirror upsert lives
  // here now. Re-enqueuing PR-matched synthesis stays out of scope.
  app.webhooks.on("pull_request", async ({ payload }) => {
    try {
      const action = payload.action;
      const organizationId = resolveOrganizationId(installationIdOf(payload));

      if (!organizationId) {
        console.warn(
          `[GitHub] No organization for installation ${installationIdOf(payload)}, skipping pull_request.${action}`
        );
        return;
      }

      const fields = buildPullRequestFields(
        payload.pull_request,
        repoRefFromWebhook(payload.repository)
      );

      await upsertExternalEntity(organizationId, fields);

      if (action === "closed") {
        resolveLinkedThreads(fields, { merged: fields.merged ?? false });
      }

      // Push-side discovery (FRO-205): when an eligible (open, non-draft) PR
      // becomes newly matchable, embed it and fan out `pr_matched` reads to
      // similar active threads. The worker owns the embed/search/fan-out; this
      // only kicks it off. Excludes `synchronize` and close/draft transitions.
      if (
        PR_MATCH_ACTIONS.has(action) &&
        fields.state === "open" &&
        fields.draft !== true
      ) {
        await enqueuePrMatch({
          organizationId,
          externalKey: fields.externalKey,
          title: fields.title,
          body: fields.body,
          headRef: fields.headRef,
          state: fields.state,
          draft: fields.draft,
        });
      }
    } catch (error) {
      console.error("[GitHub] Error handling pull_request webhook:", error);
    }
  });

  app.webhooks.onAny(async ({ name, payload }) => {
    const action = "action" in payload ? payload.action : undefined;
    const repo =
      "repository" in payload ? payload.repository?.full_name : undefined;
    console.log(
      `[GitHub] Received webhook: ${name}${action ? ` (${action})` : ""}${
        repo ? ` from ${repo}` : ""
      }`
    );
  });

  app.webhooks.onError((error) => {
    console.error(error);
  });
};
