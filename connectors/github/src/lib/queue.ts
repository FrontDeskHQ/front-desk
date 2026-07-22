import { createRedisConnection } from "@connectors/framework/runtime";
import type { PrMatchJobData } from "@workspace/schemas/signals";
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
export interface BackfillJobData {
  organizationId: string;
  installationId: number;
  owner: string;
  repo: string;
  fullName: string;
}

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
    attempts: 3,
    backoff: { delay: 10_000, type: "exponential" },
    jobId,
    removeOnComplete: { age: 24 * 3600, count: 50 },
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
        removeOnComplete: { age: 7 * 24 * 3600, count: 20 },
        removeOnFail: { count: 50 },
      },
    }
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
    attempts: 3,
    backoff: { delay: 10_000, type: "exponential" },
    jobId,
    removeOnComplete: { age: 24 * 3600, count: 100 },
    removeOnFail: { count: 200 },
  });
};

/**
 * PR push-side match queue (FRO-205). The github connector produces onto it from
 * the pull-request webhook; the worker (apps/worker) owns the processor —
 * signals/embedding is the worker's domain, not this app's. Keep the queue and
 * job names in sync with the consumer (`PR_MATCH_QUEUE` in apps/worker).
 */
const PR_MATCH_QUEUE = "pr-match";
const PR_MATCH_JOB_NAME = "match-pr";

let prMatchQueue: Queue<PrMatchJobData> | null = null;

const getPrMatchQueue = (): Queue<PrMatchJobData> => {
  if (!prMatchQueue) {
    prMatchQueue = new Queue<PrMatchJobData>(PR_MATCH_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5000, type: "exponential" },
      },
    });
  }
  return prMatchQueue;
};

/**
 * Enqueue a push-side match for a PR. One pending job per PR — scoped by
 * `(organizationId, externalKey)` so orgs sharing a repo don't coalesce onto
 * each other's match (`externalKey` is `provider:owner/repo#number`, not
 * org-unique) — coalesces a burst of webhook events (open → edit) into a single
 * embed + search: any prior non-active job for the same PR is dropped so the
 * latest content wins, matching `enqueuePrIndex`'s scheme.
 *
 * BullMQ reserves `:` as a Redis key separator and rejects it in custom job
 * ids, so the parts are joined with `_` and `externalKey`'s `:` is replaced
 * (its `_`s escaped first) to keep the id injective — the same scheme the
 * backfill/reconcile ids use.
 */
export const enqueuePrMatch = async (data: PrMatchJobData) => {
  const q = getPrMatchQueue();
  const safeExternalKey = data.externalKey
    .replaceAll("_", "__")
    .replaceAll(":", "_");
  const jobId = `pr-match_${data.organizationId}_${safeExternalKey}`;

  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "active") {
      await existing.remove();
    }
  }

  await q.add(PR_MATCH_JOB_NAME, data, {
    jobId,
    removeOnComplete: { age: 24 * 3600, count: 100 },
    removeOnFail: { count: 500 },
  });
};
