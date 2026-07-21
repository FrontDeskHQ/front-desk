import type {
  PrIndexJobData,
  PrMatchJobData,
  ThreadReadJobData,
} from "@workspace/schemas/signals";
import { initSharedLogger, log } from "@workspace/utils/logging";
import { type Job, Worker } from "bullmq";
import Redis from "ioredis";
import { handleCrawlDocumentation } from "./handlers/crawl-documentation";
import { handleIndexPr } from "./handlers/index-pr";
import { handleMatchPr } from "./handlers/match-pr";
import { ensureDocumentationCollection } from "./lib/qdrant/documentation";
import { ensureMessagesCollection } from "./lib/qdrant/messages";
import { ensurePrsCollection } from "./lib/qdrant/pull-requests";
import { ensureThreadsCollection } from "./lib/qdrant/threads";
import { executePipeline } from "./pipeline/core/orchestrator";
import { registerDefaultProcessors } from "./pipeline/processors/registration";

const THREAD_PIPELINE_QUEUE = "thread-pipeline";
const CRAWL_DOCUMENTATION_QUEUE = "crawl-documentation";
const PR_INDEX_QUEUE = "pr-index";
const PR_MATCH_QUEUE = "pr-match";

const parseBooleanEnv = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value.toLowerCase() === "true";
};

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

initSharedLogger({
  service: "worker",
  environment: process.env.NODE_ENV,
  enabled: parseBooleanEnv(process.env.LOGGING_ENABLED),
  pretty: parseBooleanEnv(process.env.LOGGING_PRETTY),
  silent: parseBooleanEnv(process.env.LOGGING_SILENT),
});

const getRedisConnection = (): Redis => {
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

const connection = getRedisConnection();

/**
 * Handler for thread-pipeline jobs
 * Runs the full thread pipeline for a single thread. TODO(issue-06): branch on
 * job.data.kind === "supersede" to null thread.agentRead without invoking the
 * synthesis processor.
 */
const handleThreadReadJob = async (job: Job<ThreadReadJobData>) => {
  const { threadId, kind, prMatched } = job.data;

  if (!threadId) {
    throw new Error("No threadId provided");
  }

  log.info(
    "worker.thread-pipeline",
    `Processing job ${job.id} (thread=${threadId}, kind=${kind}${
      prMatched ? `, pr=${prMatched.prId}` : ""
    })`,
  );

  const result = await executePipeline({
    threadIds: [threadId],
    trigger: { kind, ...(prMatched ? { prMatched } : {}) },
  });

  const successRate =
    result.summary.totalThreads > 0
      ? (
          (result.summary.processedThreads / result.summary.totalThreads) *
          100
        ).toFixed(1)
      : "0";

  log.info(
    "worker.thread-pipeline",
    `Completed job ${job.id} with ${successRate}% success rate`,
  );

  return {
    jobId: result.jobId,
    bullmqJobId: job.id,
    threadId,
    kind,
    summary: result.summary,
    successRate: `${successRate}%`,
    status: result.status,
    duration: result.duration,
  };
};

// Create workers for each queue (autorun: false — started after collections are ready)
const threadPipelineWorker = new Worker<ThreadReadJobData>(
  THREAD_PIPELINE_QUEUE,
  handleThreadReadJob,
  {
    connection,
    autorun: false,
    concurrency: 3, // Process up to 3 threads concurrently
    removeOnComplete: {
      count: 100,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 1000,
    },
  },
);

// Event handlers for thread-pipeline worker
threadPipelineWorker.on("completed", (job) => {
  log.info("worker.thread-pipeline", `Job ${job.id} completed`);
});

threadPipelineWorker.on("failed", (job, err) => {
  log.error("worker.thread-pipeline", `Job ${job?.id} failed: ${err.message}`);
  log.error("worker.thread-pipeline", formatError(err));
});

threadPipelineWorker.on("error", (err) => {
  log.error("worker.thread-pipeline", `Worker error: ${formatError(err)}`);
});

// Create crawl-documentation worker
const crawlDocWorker = new Worker(
  CRAWL_DOCUMENTATION_QUEUE,
  handleCrawlDocumentation,
  {
    connection,
    autorun: false,
    concurrency: 2,
    removeOnComplete: {
      count: 50,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 500,
    },
  },
);

crawlDocWorker.on("completed", (job) => {
  log.info("worker.crawl-documentation", `Job ${job.id} completed`);
});

crawlDocWorker.on("failed", (job, err) => {
  log.error(
    "worker.crawl-documentation",
    `Job ${job?.id} failed: ${err.message}`,
  );
  log.error("worker.crawl-documentation", formatError(err));
});

crawlDocWorker.on("error", (err) => {
  log.error("worker.crawl-documentation", `Worker error: ${formatError(err)}`);
});

// Create PR embedding index worker (FRO-203). Index-only: keeps the PR vector
// index in step with the mirror; never fans out `pr_matched` reads.
const prIndexWorker = new Worker<PrIndexJobData>(
  PR_INDEX_QUEUE,
  handleIndexPr,
  {
    connection,
    autorun: false,
    concurrency: 3,
    removeOnComplete: {
      count: 100,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 500,
    },
  },
);

prIndexWorker.on("completed", (job) => {
  log.info("worker.pr-index", `Job ${job.id} completed`);
});

prIndexWorker.on("failed", (job, err) => {
  log.error("worker.pr-index", `Job ${job?.id} failed: ${err.message}`);
  log.error("worker.pr-index", formatError(err));
});

prIndexWorker.on("error", (err) => {
  log.error("worker.pr-index", `Worker error: ${formatError(err)}`);
});

// Create PR push-side match worker (FRO-205). Embeds an eligible PR, searches
// for similar Open / In-progress threads, and fans out `pr_matched` reads for
// the unlinked ones.
const prMatchWorker = new Worker<PrMatchJobData>(PR_MATCH_QUEUE, handleMatchPr, {
  connection,
  autorun: false,
  concurrency: 3,
  removeOnComplete: {
    count: 100,
    age: 24 * 3600,
  },
  removeOnFail: {
    count: 500,
  },
});

prMatchWorker.on("completed", (job) => {
  log.info("worker.match-pr", `Job ${job.id} completed`);
});

prMatchWorker.on("failed", (job, err) => {
  log.error("worker.match-pr", `Job ${job?.id} failed: ${err.message}`);
  log.error("worker.match-pr", formatError(err));
});

prMatchWorker.on("error", (err) => {
  log.error("worker.match-pr", `Worker error: ${formatError(err)}`);
});

// Initialize and start
const initialize = async () => {
  log.info("worker", "Initializing worker");

  // Register default processors
  registerDefaultProcessors();
  log.info("worker", "Processors registered");

  // Ensure Qdrant collections exist
  const [threadsReady, messagesReady, documentationReady, prsReady] =
    await Promise.all([
      ensureThreadsCollection(),
      ensureMessagesCollection(),
      ensureDocumentationCollection(),
      ensurePrsCollection(),
    ]);
  if (!threadsReady || !messagesReady || !documentationReady || !prsReady) {
    throw new Error(
      "Qdrant collections are not ready; refusing to start workers",
    );
  }

  log.info("worker", "Qdrant collections ready");

  // Start workers now that collections are ready
  threadPipelineWorker.run();
  crawlDocWorker.run();
  prIndexWorker.run();
  prMatchWorker.run();

  log.info("worker", "Listening for jobs");
};

// Graceful shutdown
const handleShutdown = async () => {
  log.info("worker", "Shutting down workers");
  await Promise.all([
    threadPipelineWorker.close(),
    crawlDocWorker.close(),
    prIndexWorker.close(),
    prMatchWorker.close(),
  ]);
  await connection.quit();
  log.info("worker", "Workers shut down successfully");
  process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

// Start the worker
initialize().catch((error) => {
  log.error("worker", `Failed to initialize worker: ${formatError(error)}`);
  process.exit(1);
});
