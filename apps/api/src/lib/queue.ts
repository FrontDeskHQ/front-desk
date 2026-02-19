import { Queue } from "bullmq";
import Redis from "ioredis";
import "../env";

const INGEST_THREAD_QUEUE = "ingest-thread";
const CRAWL_DOCUMENTATION_QUEUE = "crawl-documentation";

export type IngestThreadJobOptions = {
  concurrency?: number;
  similarThreadsLimit?: number;
  scoreThreshold?: number;
};

export type IngestThreadJobData = {
  threadIds: string[];
  options?: IngestThreadJobOptions;
};

let connection: Redis | null = null;
let queue: Queue<IngestThreadJobData> | null = null;

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

const getIngestThreadQueue = (): Queue<IngestThreadJobData> | null => {
  if (queue) {
    return queue;
  }

  connection ??= createRedisConnection();
  if (!connection) {
    return null;
  }

  queue = new Queue<IngestThreadJobData>(INGEST_THREAD_QUEUE, { connection });
  return queue;
};

export const enqueueIngestThreadJob = async (params: {
  threadIds: string[];
  options?: IngestThreadJobOptions;
}): Promise<string | null> => {
  const ingestThreadQueue = getIngestThreadQueue();
  if (!ingestThreadQueue) {
    return null;
  }

  const job = await ingestThreadQueue.add("ingest-thread", {
    threadIds: params.threadIds,
    options: params.options,
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
  const queue = getCrawlDocQueue();
  if (!queue) {
    return null;
  }

  const job = await queue.add("crawl-documentation", data, {
    jobId: `crawl-${data.documentationSourceId}`,
  });

  return job.id ?? null;
};
