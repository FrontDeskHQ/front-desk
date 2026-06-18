import type {
  ThreadReadJobData,
  ThreadReadKind,
} from "@workspace/schemas/signals";
import { Queue } from "bullmq";
import Redis from "ioredis";
import "../env";

// TEMP: Worker service stopped on Railway — re-enable in prod when worker is
// back. Always enabled in development so the pipeline can run locally.
const WORKER_JOBS_DISABLED = process.env.NODE_ENV === "production";

const THREAD_PIPELINE_QUEUE = "thread-pipeline";
const THREAD_READ_JOB_NAME = "thread-read";
const CRAWL_DOCUMENTATION_QUEUE = "crawl-documentation";

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
  opts: { kind: ThreadReadKind } & EnqueueThreadReadOptions,
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
  const data: ThreadReadJobData = { threadId, kind: opts.kind };

  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "delayed" || state === "waiting") {
      await existing.updateData(data);
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

  const jobId = `backfill_${data.organizationId}_${data.fullName.replace("/", "_")}`;
  const job = await queue.add(GITHUB_BACKFILL_JOB_NAME, data, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 50, age: 24 * 3600 },
    removeOnFail: { count: 200 },
  });

  return job.id ?? null;
};
