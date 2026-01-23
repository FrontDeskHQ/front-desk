import { Queue } from "bullmq";
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
const queue = new Queue("test-queue", { connection });

const publishJobs = async () => {
  console.log("Publishing test jobs...");

  const jobs = [
    { message: "Hello from job 1", priority: 1 },
    { message: "Hello from job 2", priority: 2 },
    { message: "Hello from job 3", priority: 3 },
  ];

  for (const jobData of jobs) {
    const job = await queue.add("test-job", jobData, {
      priority: jobData.priority,
    });
    console.log(`✅ Added job ${job.id} to queue`);
  }

  console.log("All jobs published!");
  await queue.close();
  await connection.quit();
};

publishJobs().catch((error) => {
  console.error("Error publishing jobs:", error);
  process.exit(1);
});
