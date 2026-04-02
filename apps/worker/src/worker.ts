import { type Job, Worker } from "bullmq";
import Redis from "ioredis";
import { handleCrawlDocumentation } from "./handlers/crawl-documentation";
import { handleEmbedPr } from "./handlers/embed-pr";
import { ensureDocumentationCollection } from "./lib/qdrant/documentation";
import { ensureMessagesCollection } from "./lib/qdrant/messages";
import { ensurePrsCollection } from "./lib/qdrant/pull-requests";
import { ensureThreadsCollection } from "./lib/qdrant/threads";
import { executePipeline } from "./pipeline/core/orchestrator";
import { registerDefaultProcessors } from "./pipeline/processors/registration";

const INGEST_THREAD_QUEUE = "ingest-thread";
const CRAWL_DOCUMENTATION_QUEUE = "crawl-documentation";
const EMBED_PR_QUEUE = "embed-pr";

interface IngestThreadJobData {
  threadIds: string[];
  options?: {
    concurrency?: number;
    similarThreadsLimit?: number;
    scoreThreshold?: number;
  };
}

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
 * Handler for ingest-thread jobs
 * Processes a batch of thread IDs through the ingestion pipeline
 */
const handleIngestThreadJob = async (job: Job<IngestThreadJobData>) => {
  const { threadIds, options } = job.data;

  if (!threadIds || threadIds.length === 0) {
    throw new Error("No thread IDs provided");
  }

  console.log(
    `\n📥 Ingest-thread job ${job.id}: Processing ${threadIds.length} threads`,
  );

  const concurrency =
    options?.concurrency && options.concurrency > 0
      ? options.concurrency
      : undefined;

  const result = await executePipeline(
    { threadIds },
    {
      concurrency,
      similarThreadsLimit: options?.similarThreadsLimit,
      scoreThreshold: options?.scoreThreshold,
    },
  );

  const successRate =
    result.summary.totalThreads > 0
      ? (
          (result.summary.processedThreads / result.summary.totalThreads) *
          100
        ).toFixed(1)
      : "0";

  console.log(`\n📊 Job ${job.id} complete: ${successRate}% success rate`);

  return {
    jobId: result.jobId,
    bullmqJobId: job.id,
    threadIds,
    summary: result.summary,
    successRate: `${successRate}%`,
    status: result.status,
    duration: result.duration,
  };
};

// Create workers for each queue (autorun: false — started after collections are ready)
const ingestThreadWorker = new Worker<IngestThreadJobData>(
  INGEST_THREAD_QUEUE,
  handleIngestThreadJob,
  {
    connection,
    autorun: false,
    concurrency: 3, // Process up to 3 batches concurrently
    removeOnComplete: {
      count: 100,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 1000,
    },
  },
);

// Event handlers for ingest-thread worker
ingestThreadWorker.on("completed", (job) => {
  console.log(`✅ Ingest-thread job ${job.id} has been completed`);
});

ingestThreadWorker.on("failed", (job, err) => {
  console.error(`❌ Ingest-thread job ${job?.id} has failed:`, err.message);
  console.error(err);
});

ingestThreadWorker.on("error", (err) => {
  console.error("Ingest-thread worker error:", err);
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

// Create embed-pr worker
const embedPrWorker = new Worker(
  EMBED_PR_QUEUE,
  handleEmbedPr,
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

embedPrWorker.on("completed", (job) => {
  console.log(`✅ Embed-pr job ${job.id} has been completed`);
});

embedPrWorker.on("failed", (job, err) => {
  console.error(
    `❌ Embed-pr job ${job?.id} has failed:`,
    err.message,
  );
  console.error(err);
});

embedPrWorker.on("error", (err) => {
  console.error("Embed-pr worker error:", err);
});

crawlDocWorker.on("completed", (job) => {
  console.log(`✅ Crawl-documentation job ${job.id} has been completed`);
});

crawlDocWorker.on("failed", (job, err) => {
  console.error(
    `❌ Crawl-documentation job ${job?.id} has failed:`,
    err.message,
  );
  console.error(err);
});

crawlDocWorker.on("error", (err) => {
  console.error("Crawl-documentation worker error:", err);
});

// Initialize and start
const initialize = async () => {
  console.log("Initializing worker...");

  // Register default processors
  registerDefaultProcessors();
  console.log("✅ Processors registered");

  // Ensure Qdrant collections exist
  const [threadsReady, messagesReady, documentationReady, prsReady] = await Promise.all([
    ensureThreadsCollection(),
    ensureMessagesCollection(),
    ensureDocumentationCollection(),
    ensurePrsCollection(),
  ]);
  if (!threadsReady || !messagesReady || !documentationReady || !prsReady) {
    console.warn(
      "⚠️ Qdrant collection initialization failed - continuing anyway",
    );
  } else {
    console.log("✅ Qdrant collections ready");
  }

  // Start workers now that collections are ready
  ingestThreadWorker.run();
  crawlDocWorker.run();
  embedPrWorker.run();

  console.log("\nListening for jobs...");
};

// Graceful shutdown
const handleShutdown = async () => {
  console.log("\nShutting down workers...");
  await Promise.all([ingestThreadWorker.close(), crawlDocWorker.close(), embedPrWorker.close()]);
  await connection.quit();
  console.log("Workers shut down successfully");
  process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

// Start the worker
initialize().catch((error) => {
  console.error("Failed to initialize worker:", error);
  process.exit(1);
});
