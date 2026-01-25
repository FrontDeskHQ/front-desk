import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { ensureThreadsCollection } from "./lib/qdrant/threads";
import { processIngestThreadBatch } from "./pipelines/ingest-thread";

const INGEST_THREAD_QUEUE = "ingest-thread";

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
    return new Redis(process.env.REDIS_URL);
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

  const result = await processIngestThreadBatch(threadIds, options);

  const successRate = (
    (result.summary.postProcessorSuccess / result.summary.total) *
    100
  ).toFixed(1);

  console.log(`\n📊 Job ${job.id} complete: ${successRate}% success rate`);

  return {
    jobId: job.id,
    threadIds,
    summary: result.summary,
    successRate: `${successRate}%`,
  };
};

// Create workers for each queue
const ingestThreadWorker = new Worker<IngestThreadJobData>(
  INGEST_THREAD_QUEUE,
  handleIngestThreadJob,
  {
    connection,
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
});

ingestThreadWorker.on("error", (err) => {
  console.error("Ingest-thread worker error:", err);
});

// Initialize and start
const initialize = async () => {
  console.log("Initializing worker...");

  // Ensure Qdrant collection exists
  const qdrantReady = await ensureThreadsCollection();
  if (!qdrantReady) {
    console.warn(
      "⚠️ Qdrant collection initialization failed - continuing anyway",
    );
  } else {
    console.log("✅ Qdrant collection ready");
  }

  console.log("\nListening for jobs...");
};

// Graceful shutdown
const handleShutdown = async () => {
  console.log("\nShutting down workers...");
  await Promise.all([ingestThreadWorker.close()]);
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
