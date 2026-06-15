import { Queue } from "bullmq";
import Redis from "ioredis";

/**
 * Queue + connection for the github app's own BullMQ jobs. Integration apps own
 * their jobs (apps/worker is only the ingestion pipeline), so the queue and its
 * processor both live inside this app.
 */
export const BACKFILL_QUEUE = "github-backfill";
const BACKFILL_JOB_NAME = "backfill-repo";

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
 * Create a Redis connection configured for BullMQ (`maxRetriesPerRequest: null`
 * is required by both Queue and Worker). Mirrors the worker app's connection
 * resolution: prefer `REDIS_URL`, fall back to discrete host/port/etc.
 */
export const createRedisConnection = (): Redis => {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  const redisConfig: {
    host: string;
    port?: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest: null;
  } = {
    host: process.env.REDIS_HOST ?? "localhost",
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
 */
export const enqueueRepoBackfill = async (data: BackfillJobData) => {
  await getQueue().add(BACKFILL_JOB_NAME, data, {
    jobId: `backfill:${data.organizationId}:${data.fullName}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 50, age: 24 * 3600 },
    removeOnFail: { count: 200 },
  });
};
