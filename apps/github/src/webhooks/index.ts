import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { formatGitHubId } from "@workspace/schemas/external-issue";
import { statusValues } from "@workspace/ui/components/indicator";
import { ulid } from "ulid";
import { app } from "../lib/github";
import { fetchClient, store } from "../lib/live-state";
import { STATUS_CLOSED, STATUS_OPEN, STATUS_RESOLVED } from "../utils";

/**
 * Shape of an externalEntity mirror row, minus the columns the upsert helper
 * fills in itself (`id`, `organizationId`, `lastSyncedAt`).
 */
type ExternalEntityFields = {
  provider: string;
  externalKey: string;
  type: "issue" | "pull_request";
  number: number;
  repoFullName: string;
  url: string;
  title: string;
  body: string | null;
  state: string;
  authorLogin: string | null;
  assignees: string[];
  labels: string[];
  externalCreatedAt: Date;
  externalUpdatedAt: Date;
  closedAt: Date | null;
  merged: boolean | null;
  mergedAt: Date | null;
  draft: boolean | null;
  headRef: string | null;
  baseRef: string | null;
  deletedAt: Date | null;
};

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
 * Insert or update the org-scoped mirror row for an issue/PR. Keyed by
 * `(organizationId, externalKey)` on the query side until live-state supports
 * composite indexes. Always refreshes `lastSyncedAt`.
 */
const upsertExternalEntity = async (
  organizationId: string,
  fields: ExternalEntityFields
) => {
  const existing = await fetchClient.query.externalEntity
    .first({ organizationId, externalKey: fields.externalKey })
    .get();

  if (existing) {
    await fetchClient.mutate.externalEntity.update(existing.id, {
      ...fields,
      lastSyncedAt: new Date(),
    });
    return;
  }

  await fetchClient.mutate.externalEntity.insert({
    id: ulid().toLowerCase(),
    organizationId,
    ...fields,
    lastSyncedAt: new Date(),
  });
};

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

    store.mutate.thread.update(thread.id, { status: newStatus });

    store.mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId: thread.id,
      type: "status_changed",
      createdAt: new Date(),
      userId: null,
      metadataStr: JSON.stringify({
        oldStatus,
        newStatus,
        oldStatusLabel: statusValues[oldStatus]?.label,
        newStatusLabel: statusValues[newStatus]?.label,
        source: "github",
        repoFullName: fields.repoFullName,
        ...(fields.type === "issue"
          ? { issueNumber: fields.number }
          : { prNumber: fields.number, merged: meta.merged }),
        userName: "GitHub Integration",
      }),
      // Mark as replicated from GitHub so it doesn't sync back
      replicatedStr: JSON.stringify({ github: true }),
    });
  }
};

const buildIssueFields = (
  payload: EmitterWebhookEvent<"issues">["payload"]
): ExternalEntityFields => {
  const { issue, repository } = payload;
  return {
    provider: "github",
    externalKey: formatGitHubId(issue.id, repository.owner.login, repository.name),
    type: "issue",
    number: issue.number,
    repoFullName: repository.full_name,
    url: issue.html_url,
    title: issue.title,
    body: issue.body ?? null,
    state: issue.state ?? "open",
    authorLogin: issue.user?.login ?? null,
    assignees: (issue.assignees ?? [])
      .map((a) => a?.login)
      .filter((login): login is string => Boolean(login)),
    labels: (issue.labels ?? [])
      .map((l) => (typeof l === "string" ? l : l?.name))
      .filter((name): name is string => Boolean(name)),
    externalCreatedAt: new Date(issue.created_at),
    externalUpdatedAt: new Date(issue.updated_at),
    closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
    merged: null,
    mergedAt: null,
    draft: null,
    headRef: null,
    baseRef: null,
    deletedAt: null,
  };
};

const buildPullRequestFields = (
  payload: EmitterWebhookEvent<"pull_request">["payload"]
): ExternalEntityFields => {
  const { pull_request: pr, repository } = payload;
  return {
    provider: "github",
    externalKey: formatGitHubId(pr.id, repository.owner.login, repository.name),
    type: "pull_request",
    number: pr.number,
    repoFullName: repository.full_name,
    url: pr.html_url,
    title: pr.title,
    body: pr.body ?? null,
    state: pr.state,
    authorLogin: pr.user?.login ?? null,
    assignees: (pr.assignees ?? [])
      .map((a) => a?.login)
      .filter((login): login is string => Boolean(login)),
    labels: (pr.labels ?? [])
      .map((l) => l?.name)
      .filter((name): name is string => Boolean(name)),
    externalCreatedAt: new Date(pr.created_at),
    externalUpdatedAt: new Date(pr.updated_at),
    closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
    merged: pr.merged ?? false,
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
    draft: pr.draft ?? false,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    deletedAt: null,
  };
};

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

      const fields = buildIssueFields(payload);

      if (action === "deleted" || action === "transferred") {
        fields.deletedAt = new Date();
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

      const fields = buildPullRequestFields(payload);

      await upsertExternalEntity(organizationId, fields);

      if (action === "closed") {
        resolveLinkedThreads(fields, { merged: fields.merged ?? false });
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
