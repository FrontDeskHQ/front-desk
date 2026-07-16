import { createRedisConnection } from "@connectors/framework/runtime";
import { Queue } from "bullmq";

export { createRedisConnection } from "@connectors/framework/runtime";

/**
 * Queue + connection for the github app's own BullMQ jobs. Integration apps own
 * their jobs (apps/worker is only the ingestion pipeline), so the queue and its
 * processor both live inside this app.
 */
export const BACKFILL_QUEUE = "github-backfill";
const BACKFILL_JOB_NAME = "backfill-repo";

/**
 * Drift-reconciliation queue. A daily repeatable `dispatch` job fans out one
 * `repo` job per connected repo; each repo job re-pages issues/PRs and
 * reconciles the mirror against upstream (see `jobs/reconcile.ts`). Both job
 * types share this queue and are routed by name in the worker.
 */
export const RECONCILE_QUEUE = "github-reconcile";
export const RECONCILE_DISPATCH_JOB_NAME = "reconcile-dispatch";
export const RECONCILE_REPO_JOB_NAME = "reconcile-repo";
const RECONCILE_SCHEDULER_ID = "github-reconcile-daily";

/**
 * Daily at 04:00 UTC — a low-traffic backstop for missed/dropped webhooks.
 * Tighten the cadence only if drift shows up in practice.
 */
const RECONCILE_CRON = "0 4 * * *";

/**
 * Data for a repo backfill: everything the processor needs to authenticate as
 * the installation and page the repo's issues/PRs.
 */
export type BackfillJobData = {
  organizationId: string;
  installationId: number;
  owner: string;
  repo: string;
  fullName: string;
};

/**
 * Data for a single-repo reconcile. Structurally identical to a backfill (same
 * auth + paging inputs); kept as a distinct type for intent.
 */
export type ReconcileRepoJobData = BackfillJobData;

let queue: Queue<BackfillJobData> | null = null;

const getQueue = (): Queue<BackfillJobData> => {
  if (!queue) {
    queue = new Queue<BackfillJobData>(BACKFILL_QUEUE, {
      connection: createRedisConnection(),
    });
  }
  return queue;
};

/**
 * Enqueue a backfill for a single repo. The job id is derived from
 * `(organizationId, fullName)` so re-connecting or re-adding the same repo
 * coalesces onto one pending job rather than piling up duplicates — the
 * processor itself is also idempotent (upsert-by-externalKey).
 *
 * BullMQ reserves `:` as a Redis key separator and rejects it in custom job
 * ids, so the parts are joined with `_` (and `fullName`'s `/` is replaced too).
 * Underscores in `fullName` are escaped first so the id stays injective and
 * matches the scheme used by the API's `enqueueGithubBackfill`.
 */
const safeFullName = (fullName: string): string =>
  fullName.replaceAll("_", "__").replace("/", "_");

export const enqueueRepoBackfill = async (data: BackfillJobData) => {
  const jobId = `backfill_${data.organizationId}_${safeFullName(data.fullName)}`;
  await getQueue().add(BACKFILL_JOB_NAME, data, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 50, age: 24 * 3600 },
    removeOnFail: { count: 200 },
  });
};

let reconcileQueue: Queue | null = null;

const getReconcileQueue = (): Queue => {
  if (!reconcileQueue) {
    reconcileQueue = new Queue(RECONCILE_QUEUE, {
      connection: createRedisConnection(),
    });
  }
  return reconcileQueue;
};

/**
 * Register (or refresh) the daily repeatable dispatch job. `upsertJobScheduler`
 * is idempotent, so this is safe to call on every app boot.
 */
export const ensureReconcileScheduler = async () => {
  await getReconcileQueue().upsertJobScheduler(
    RECONCILE_SCHEDULER_ID,
    { pattern: RECONCILE_CRON },
    {
      name: RECONCILE_DISPATCH_JOB_NAME,
      opts: {
        removeOnComplete: { count: 20, age: 7 * 24 * 3600 },
        removeOnFail: { count: 50 },
      },
    },
  );
};

/**
 * Enqueue a reconcile for a single repo. The job id is derived from
 * `(organizationId, fullName)` so overlapping dispatch runs coalesce onto one
 * pending job per repo rather than piling up duplicates — the processor itself
 * is also idempotent (upsert-by-externalKey).
 */
export const enqueueRepoReconcile = async (data: ReconcileRepoJobData) => {
  const jobId = `reconcile_${data.organizationId}_${safeFullName(data.fullName)}`;
  await getReconcileQueue().add(RECONCILE_REPO_JOB_NAME, data, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 100, age: 24 * 3600 },
    removeOnFail: { count: 200 },
  });
};
