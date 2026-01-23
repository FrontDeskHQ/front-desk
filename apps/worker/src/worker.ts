import { Worker } from "bullmq";
import Redis from "ioredis";

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

const worker = new Worker(
  "test-queue",
  async (job) => {
    console.log(`Processing job ${job.id} with data:`, job.data);

    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`Job ${job.id} completed successfully`);

    return { result: `Processed: ${job.data.message}` };
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: {
      count: 100,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 1000,
    },
  },
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} has been completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} has failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

console.log("Worker started and listening for jobs...");

// Graceful shutdown
const handleShutdown = async () => {
  console.log("Shutting down worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);
