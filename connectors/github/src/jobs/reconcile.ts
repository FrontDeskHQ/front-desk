import { Worker } from "bullmq";
import type { Job } from "bullmq";

import {
  buildIssueFields,
  buildPullRequestFields,
  upsertExternalEntity,
} from "../lib/external-entity";
import type { ExternalEntityFields, RepoRef } from "../lib/external-entity";
import { getOctokit } from "../lib/github";
import { fetchClient, store } from "../lib/live-state";
import {
  createRedisConnection,
  ensureReconcileScheduler,
  enqueueRepoReconcile,
  RECONCILE_DISPATCH_JOB_NAME,
  RECONCILE_QUEUE,
  RECONCILE_REPO_JOB_NAME,
} from "../lib/queue";
import type { ReconcileRepoJobData } from "../lib/queue";

const PER_PAGE = 100;

/**
 * Abort the whole job after this many consecutive write failures. Isolated bad
 * items are tolerated (logged + skipped); a run of back-to-back failures signals
 * a systemic problem (auth, network, DB) and throwing lets BullMQ retry the
 * whole job with backoff. Mirrors the backfill job's tolerance.
 */
const MAX_CONSECUTIVE_FAILURES = 10;

interface ReconcileTally {
  upserted: number;
  unchanged: number;
  deleted: number;
  failed: number;
}

class SystemicReconcileError extends Error {
  name = "SystemicReconcileError";
}

/** Shape of a connected repo as persisted in the github integration config. */
interface GithubRepoConfig {
  fullName: string;
  owner: string;
  name: string;
}

/**
 * Guard against malformed repo entries in a (potentially hand-edited or legacy)
 * integration config: all three fields must be non-empty strings to build a
 * usable reconcile job.
 */
const isValidRepoConfig = (repo: unknown): repo is GithubRepoConfig => {
  if (typeof repo !== "object" || repo === null) {
    return false;
  }
  const { fullName, owner, name } = repo as Record<string, unknown>;
  return (
    typeof fullName === "string" &&
    fullName.length > 0 &&
    typeof owner === "string" &&
    owner.length > 0 &&
    typeof name === "string" &&
    name.length > 0
  );
};

/**
 * Re-page one endpoint's worth of entities and reconcile them against the
 * mirror snapshot. For each upstream item we record its key in `seen` (so the
 * deletion pass can tell what still exists) and upsert it only when GitHub's
 * `updated_at` is newer than the timestamp we already stored — the stored
 * `externalUpdatedAt` is our per-row "updated-since" cursor. Comparing GitHub
 * timestamps to each other (rather than to `lastSyncedAt`, which is on our
 * clock) avoids cross-clock skew.
 *
 * `toFields` returns null for items this pass should skip (the issues endpoint
 * also returns PRs, which the PR pass owns).
 */
const reconcilePage = async <TItem>(
  organizationId: string,
  iterator: AsyncIterable<{ data: TItem[] }>,
  toFields: (item: TItem) => ExternalEntityFields | null,
  cursorByKey: Map<string, number>,
  seen: Set<string>,
  tally: ReconcileTally,
  label: string
): Promise<void> => {
  let consecutiveFailures = 0;

  for await (const { data: page } of iterator) {
    for (const item of page) {
      const fields = toFields(item);
      if (!fields) {
        continue;
      }

      seen.add(fields.externalKey);

      const cursor = cursorByKey.get(fields.externalKey);
      if (
        cursor !== undefined &&
        fields.externalUpdatedAt.getTime() <= cursor
      ) {
        tally.unchanged++;
        continue;
      }

      try {
        await upsertExternalEntity(organizationId, fields);
        tally.upserted++;
        consecutiveFailures = 0;
      } catch (error) {
        tally.failed++;
        consecutiveFailures++;
        console.error(
          `[GitHub] Failed to reconcile ${label} ${fields.repoFullName}#${fields.number}:`,
          error
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new SystemicReconcileError(
            `Aborting ${fields.repoFullName} ${label} reconcile after ${consecutiveFailures} consecutive write failures`
          );
        }
      }
    }
  }
};

/**
 * Reconcile a single repo's mirror with upstream GitHub.
 *
 * Re-pages the full issue + PR list (`state=all`) rather than relying on
 * GitHub's server-side `since` filter: `since` would hide deleted entities, and
 * we need the complete current key set to detect upstream deletions. The
 * per-row cursor keeps this cheap on writes — only entities GitHub has touched
 * since we last stored them are re-upserted. Any mirrored entity absent from the
 * re-page (a missed `deleted`/`transferred` webhook) is soft-deleted.
 */
export const handleReconcileRepo = async (job: Job<ReconcileRepoJobData>) => {
  const { data } = job;
  const repo: RepoRef = {
    fullName: data.fullName,
    name: data.repo,
    owner: data.owner,
  };

  console.log(
    `[GitHub] Reconciling ${data.fullName} (org ${data.organizationId})`
  );

  // Snapshot the current (non-deleted) mirror rows for this repo: the cursor for
  // skipping unchanged upserts, and the baseline for detecting deletions.
  const mirrorRows = await fetchClient.query.externalEntity.listForRepo({
    organizationId: data.organizationId,
    repoFullName: data.fullName,
  });

  const cursorByKey = new Map<string, number>();
  for (const row of mirrorRows) {
    cursorByKey.set(row.externalKey, new Date(row.externalUpdatedAt).getTime());
  }

  const octokit = await getOctokit(data.installationId);
  const seen = new Set<string>();
  const tally: ReconcileTally = {
    deleted: 0,
    failed: 0,
    unchanged: 0,
    upserted: 0,
  };

  await reconcilePage(
    data.organizationId,
    octokit.paginate.iterator("GET /repos/{owner}/{repo}/issues", {
      owner: data.owner,
      per_page: PER_PAGE,
      repo: data.repo,
      state: "all",
    }),
    // The issues endpoint returns PRs too; the PR pass owns those.
    (issue) => (issue.pull_request ? null : buildIssueFields(issue, repo)),
    cursorByKey,
    seen,
    tally,
    "issue"
  );

  await reconcilePage(
    data.organizationId,
    octokit.paginate.iterator("GET /repos/{owner}/{repo}/pulls", {
      owner: data.owner,
      per_page: PER_PAGE,
      repo: data.repo,
      state: "all",
    }),
    (pr) => buildPullRequestFields(pr, repo),
    cursorByKey,
    seen,
    tally,
    "pull request"
  );

  // Anything still in the mirror but not seen upstream was deleted/transferred
  // out without us getting the webhook. Soft-delete it.
  let consecutiveFailures = 0;
  for (const row of mirrorRows) {
    if (seen.has(row.externalKey)) {
      continue;
    }
    try {
      await fetchClient.mutate.externalEntity.softDelete({
        externalKey: row.externalKey,
        organizationId: data.organizationId,
      });
      tally.deleted++;
      consecutiveFailures = 0;
    } catch (error) {
      tally.failed++;
      consecutiveFailures++;
      console.error(
        `[GitHub] Failed to soft-delete ${row.repoFullName}#${row.number}:`,
        error
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new SystemicReconcileError(
          `Aborting ${data.fullName} soft-delete pass after ${consecutiveFailures} consecutive failures`
        );
      }
    }
  }

  console.log(
    `[GitHub] Reconciled ${data.fullName}: ${tally.upserted} upserted, ` +
      `${tally.unchanged} unchanged, ${tally.deleted} soft-deleted ` +
      `(${tally.failed} failed)`
  );

  return { repoFullName: data.fullName, ...tally };
};

/**
 * Fan out one reconcile job per connected repo across every enabled github
 * integration. Reads the integrations from the live-state store (kept in sync in
 * this process), mirroring how the webhook handler resolves installations.
 */
export const handleReconcileDispatch = async () => {
  const integrations = store.query.integration.where({ type: "github" }).get();

  let enqueued = 0;
  for (const integration of integrations) {
    if (!integration.enabled || !integration.configStr) {
      continue;
    }

    let config: { installationId?: number; repos?: GithubRepoConfig[] };
    try {
      config = JSON.parse(integration.configStr);
    } catch {
      console.error(
        `[GitHub] Skipping reconcile for integration ${integration.id}: malformed config`
      );
      continue;
    }

    const { installationId, repos } = config;
    if (!installationId || !repos?.length) {
      continue;
    }

    // The config is built from octokit data in setup.ts, but it's untrusted at
    // read time (hand-edited/legacy rows). Drop malformed entries so they don't
    // produce broken jobs that just fail-and-retry forever.
    const validRepos = repos.filter(isValidRepoConfig);
    if (validRepos.length < repos.length) {
      console.error(
        `[GitHub] Skipping ${repos.length - validRepos.length} malformed repo entr(y/ies) for integration ${integration.id}`
      );
    }
    if (!validRepos.length) {
      continue;
    }

    const results = await Promise.allSettled(
      validRepos.map((repo) =>
        enqueueRepoReconcile({
          fullName: repo.fullName,
          installationId,
          organizationId: integration.organizationId,
          owner: repo.owner,
          repo: repo.name,
        })
      )
    );

    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error(
          `[GitHub] Failed to enqueue reconcile for ${validRepos[index]?.fullName}:`,
          result.reason
        );
      } else {
        enqueued++;
      }
    }
  }

  console.log(`[GitHub] Reconcile dispatch enqueued ${enqueued} repo job(s)`);
  return { enqueued };
};

/**
 * Start the reconcile worker and register the daily dispatch schedule. Called
 * once at app startup alongside the webhook listeners and backfill worker.
 */
export const startReconcileWorker = (): Worker => {
  const worker = new Worker(
    RECONCILE_QUEUE,
    async (job: Job) => {
      if (job.name === RECONCILE_REPO_JOB_NAME) {
        return handleReconcileRepo(job as Job<ReconcileRepoJobData>);
      }
      if (job.name === RECONCILE_DISPATCH_JOB_NAME) {
        return handleReconcileDispatch();
      }
      console.warn(`[GitHub] Unknown reconcile job name: ${job.name}`);
    },
    {
      concurrency: 2,
      connection: createRedisConnection(),
      removeOnComplete: { age: 24 * 3600, count: 50 },
      removeOnFail: { count: 200 },
    }
  );

  worker.on("completed", (job) => {
    console.log(`[GitHub] Reconcile job ${job.id} (${job.name}) completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[GitHub] Reconcile job ${job?.id} (${job?.name}) failed:`,
      err
    );
  });

  worker.on("error", (err) => {
    console.error("[GitHub] Reconcile worker error:", err);
  });

  ensureReconcileScheduler().catch((error) => {
    console.error("[GitHub] Failed to register reconcile scheduler:", error);
  });

  return worker;
};
