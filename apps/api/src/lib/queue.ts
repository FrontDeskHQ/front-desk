import type {
  PrIndexJobData,
  PrMatchCandidate,
  ThreadReadJobData,
  ThreadReadKind,
} from "@workspace/schemas/signals";
import { Queue } from "bullmq";
import Redis from "ioredis";
import "../env";

// TEMP: Worker service stopped on Railway — re-enable in prod when worker is
// back. Always enabled in development so the pipeline can run locally.
const WORKER_JOBS_DISABLED = process.env.NODE_ENV === "production";

/** False when worker enqueue is intentionally skipped (e.g. prod without worker service). */
export const areWorkerJobsEnabled = (): boolean => !WORKER_JOBS_DISABLED;

const THREAD_PIPELINE_QUEUE = "thread-pipeline";
const THREAD_READ_JOB_NAME = "thread-read";
const CRAWL_DOCUMENTATION_QUEUE = "crawl-documentation";
const PR_INDEX_QUEUE = "pr-index";
const PR_INDEX_JOB_NAME = "index-pr";

const DEFAULT_DEBOUNCE_MS = (() => {
  const raw = process.env.THREAD_READ_DEBOUNCE_MS;
  if (!raw) return 2000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2000;
})();

export type ThreadReadJobPriority = "high" | "normal" | "low";

const THREAD_READ_PRIORITY_VALUES: Record<ThreadReadJobPriority, number> = {
  high: 1,
  normal: 10,
  low: 100,
};

export type EnqueueThreadReadOptions = {
  priority?: ThreadReadJobPriority;
  delayMs?: number;
};

let connection: Redis | null = null;
let queue: Queue<ThreadReadJobData> | null = null;

const createRedisConnection = (): Redis | null => {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  if (!process.env.REDIS_HOST) {
    return null;
  }

  const redisConfig: {
    host: string;
    port?: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest: null;
  } = {
    host: process.env.REDIS_HOST,
    maxRetriesPerRequest: null,
  };

  if (process.env.REDIS_PORT) {
    redisConfig.port = Number.parseInt(process.env.REDIS_PORT, 10);
  }

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  if (process.env.REDIS_DB) {
    redisConfig.db = Number.parseInt(process.env.REDIS_DB, 10);
  }

  return new Redis(redisConfig);
};

const getThreadPipelineQueue = (): Queue<ThreadReadJobData> | null => {
  if (queue) {
    return queue;
  }

  connection ??= createRedisConnection();
  if (!connection) {
    return null;
  }

  queue = new Queue<ThreadReadJobData>(THREAD_PIPELINE_QUEUE, { connection });
  return queue;
};

export const enqueueThreadRead = async (
  threadId: string,
  opts: {
    kind: ThreadReadKind;
    /** Candidate PR for a `pr_matched` trigger (ADR 0006 trigger channel). */
    prMatched?: PrMatchCandidate;
  } & EnqueueThreadReadOptions,
): Promise<string | null> => {
  if (WORKER_JOBS_DISABLED) {
    return null;
  }

  const q = getThreadPipelineQueue();
  if (!q) {
    return null;
  }

  const delay = opts.delayMs ?? DEFAULT_DEBOUNCE_MS;
  const priority = THREAD_READ_PRIORITY_VALUES[opts.priority ?? "normal"];

  // TODO(issue-09): manual kind should bypass dedup (unique jobId + delay 0)
  // and invalidate synthesis-track idempotency keys before enqueueing. For now
  // it falls through to the normal-dedup path so the surface compiles.
  const jobId = `thread:${threadId}:read`;
  const data: ThreadReadJobData = {
    threadId,
    kind: opts.kind,
    ...(opts.prMatched ? { prMatched: opts.prMatched } : {}),
  };

  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "delayed" || state === "waiting") {
      // Coalesce onto the single pending job (ADR 0006). The latest cause wins
      // for `kind` (it drives cadence/hash-invalidation), but never drop a PR
      // payload a prior `pr_matched` trigger pushed: keep the existing candidate
      // when this enqueue carries none, so both surfaces reach synthesis.
      const merged: ThreadReadJobData = {
        threadId,
        kind: opts.kind,
        ...((opts.prMatched ?? existing.data.prMatched)
          ? { prMatched: opts.prMatched ?? existing.data.prMatched }
          : {}),
      };
      await existing.updateData(merged);
      return existing.id ?? jobId;
    }
  }

  const job = await q.add(THREAD_READ_JOB_NAME, data, {
    jobId,
    delay,
    priority,
  });

  return job.id ?? null;
};

// Crawl Documentation Queue

export type CrawlDocumentationJobData = {
  documentationSourceId: string;
  organizationId: string;
  baseUrl: string;
};

let crawlDocQueue: Queue<CrawlDocumentationJobData> | null = null;

const getCrawlDocQueue = (): Queue<CrawlDocumentationJobData> | null => {
  if (crawlDocQueue) {
    return crawlDocQueue;
  }

  connection ??= createRedisConnection();
  if (!connection) {
    return null;
  }

  crawlDocQueue = new Queue<CrawlDocumentationJobData>(
    CRAWL_DOCUMENTATION_QUEUE,
    {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    },
  );
  return crawlDocQueue;
};

export const enqueueCrawlDocumentation = async (
  data: CrawlDocumentationJobData,
): Promise<string | null> => {
  if (WORKER_JOBS_DISABLED) {
    return null;
  }

  const queue = getCrawlDocQueue();
  if (!queue) {
    return null;
  }

  const job = await queue.add("crawl-documentation", data, {
    jobId: `crawl-${data.documentationSourceId}`,
  });

  return job.id ?? null;
};

// PR embedding index queue (FRO-203)
//
// The worker owns the PR vector index (embedding + Qdrant live only there); the
// API is the single mirror choke point (`externalEntity.upsert`), so it enqueues
// an index job after every PR mirror write. Index-only: this never fans out
// `pr_matched` thread reads. One pending job per PR (`pr-index:{externalKey}`)
// coalesces a burst of mirror events into a single re-embed.

let prIndexQueue: Queue<PrIndexJobData> | null = null;

const getPrIndexQueue = (): Queue<PrIndexJobData> | null => {
  if (prIndexQueue) {
    return prIndexQueue;
  }

  connection ??= createRedisConnection();
  if (!connection) {
    return null;
  }

  prIndexQueue = new Queue<PrIndexJobData>(PR_INDEX_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  });
  return prIndexQueue;
};

export const enqueuePrIndex = async (
  data: PrIndexJobData,
): Promise<string | null> => {
  if (WORKER_JOBS_DISABLED) {
    return null;
  }

  const q = getPrIndexQueue();
  if (!q) {
    return null;
  }

  // Latest mirror state wins: a pending re-index for the same PR is replaced by
  // this newer one (BullMQ ignores `add` for an existing jobId, so drop the
  // stale job first). Cheap because the worker skips re-embedding on unchanged
  // content anyway.
  const jobId = `pr-index:${data.externalKey}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "delayed" || state === "waiting") {
      await existing.remove();
    }
  }

  const job = await q.add(PR_INDEX_JOB_NAME, data, {
    jobId,
    removeOnComplete: { count: 100, age: 24 * 3600 },
    removeOnFail: { count: 500 },
  });

  return job.id ?? null;
};

// GitHub backfill queue
//
// The github app owns this job: it runs the processor (apps/github/src/jobs/
// backfill.ts) and defines the canonical queue/job constants and enqueue helper
// (apps/github/src/lib/queue.ts). The API only *enqueues* onto the same Redis
// queue — currently for the dev-only manual sync that stands in for webhooks
// locally. Keep the queue name, job name and jobId scheme in sync with the
// owner.
const GITHUB_BACKFILL_QUEUE = "github-backfill";
const GITHUB_BACKFILL_JOB_NAME = "backfill-repo";

export type GithubBackfillJobData = {
  organizationId: string;
  installationId: number;
  owner: string;
  repo: string;
  fullName: string;
};

let githubBackfillQueue: Queue<GithubBackfillJobData> | null = null;

const getGithubBackfillQueue = (): Queue<GithubBackfillJobData> | null => {
  if (githubBackfillQueue) {
    return githubBackfillQueue;
  }

  connection ??= createRedisConnection();
  if (!connection) {
    return null;
  }

  githubBackfillQueue = new Queue<GithubBackfillJobData>(
    GITHUB_BACKFILL_QUEUE,
    {
      connection,
    },
  );
  return githubBackfillQueue;
};

/**
 * Enqueue a full issue/PR backfill for a single repo onto the github app's
 * queue. The jobId is derived from `(organizationId, fullName)` so re-running
 * coalesces onto one pending job per repo — the processor is idempotent
 * (upsert-by-externalKey), so re-running only refreshes existing rows.
 */
export const enqueueGithubBackfill = async (
  data: GithubBackfillJobData,
): Promise<string | null> => {
  const queue = getGithubBackfillQueue();
  if (!queue) {
    return null;
  }

  // Escape existing underscores before swapping the `/` separator so the jobId
  // stays injective (e.g. `a_b/c` and `a/b_c` map to distinct ids).
  const safeFullName = data.fullName.replaceAll("_", "__").replace("/", "_");
  const jobId = `backfill_${data.organizationId}_${safeFullName}`;
  const job = await queue.add(GITHUB_BACKFILL_JOB_NAME, data, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 50, age: 24 * 3600 },
    removeOnFail: { count: 200 },
  });

  return job.id ?? null;
};
