import { type Job, Queue, Worker } from "bullmq";
import type { WebClient } from "@slack/web-api";
import "../env";

// Redis connection configuration
const getRedisConnection = () => {
  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL };
  }

  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: process.env.REDIS_PORT
      ? Number.parseInt(process.env.REDIS_PORT, 10)
      : 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : 0,
  };
};

// Job data types adapted for Slack
export type BackfillChannelJobData = {
  type: "backfill-channel";
  channelId: string; // Slack channel ID
  channelName: string;
  teamId: string; // Slack workspace ID
  organizationId: string;
};

export type BackfillThreadJobData = {
  type: "backfill-thread";
  channelId: string; // Parent channel (needed for API calls)
  threadTs: string; // Thread parent timestamp
  teamId: string;
  organizationId: string;
};

export type BackfillJobData = BackfillChannelJobData | BackfillThreadJobData;

// Queue instance
export const backfillQueue = new Queue<BackfillJobData>("slack-backfill", {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      count: 50, // Keep last 50 failed jobs for debugging
    },
  },
});

// Worker setup - must be initialized with the Slack client getter
let backfillWorker: Worker<BackfillJobData> | null = null;

export type BackfillHandlers = {
  processChannel: (
    client: WebClient,
    channelId: string,
    teamId: string,
    organizationId: string,
  ) => Promise<void>;
  processThread: (
    client: WebClient,
    channelId: string,
    threadTs: string,
    teamId: string,
    organizationId: string,
  ) => Promise<void>;
};

export const initializeBackfillWorker = (
  getClientForTeam: (teamId: string) => Promise<WebClient | null>,
  handlers: BackfillHandlers,
) => {
  if (backfillWorker) {
    console.log("[Slack] Backfill worker already initialized");
    return backfillWorker;
  }

  backfillWorker = new Worker<BackfillJobData>(
    "slack-backfill",
    async (job: Job<BackfillJobData>) => {
      const { data } = job;

      const client = await getClientForTeam(data.teamId);
      if (!client) {
        throw new Error(`Could not get client for team ${data.teamId}`);
      }

      if (data.type === "backfill-channel") {
        console.log(
          `[Queue] Processing channel backfill: #${data.channelName}`,
        );
        await handlers.processChannel(
          client,
          data.channelId,
          data.teamId,
          data.organizationId,
        );
        console.log(`[Queue] Completed channel backfill: #${data.channelName}`);
      } else if (data.type === "backfill-thread") {
        console.log(`[Queue] Processing thread backfill: ${data.threadTs}`);
        await handlers.processThread(
          client,
          data.channelId,
          data.threadTs,
          data.teamId,
          data.organizationId,
        );
        console.log(`[Queue] Completed thread backfill: ${data.threadTs}`);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // Process 1 job at a time (more conservative for Slack)
      limiter: {
        max: 5, // Max 5 jobs
        duration: 60000, // Per minute (Slack rate limits are stricter)
      },
    },
  );

  backfillWorker.on("completed", (job) => {
    console.log(`[Queue] Job ${job.id} completed successfully`);
  });

  backfillWorker.on("failed", (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err.message);
  });

  backfillWorker.on("error", (err) => {
    console.error("[Queue] Worker error:", err);
  });

  console.log("[Slack] Backfill worker initialized");
  return backfillWorker;
};

// Helper to add channel backfill job
export const addChannelBackfillJob = async (
  channelId: string,
  channelName: string,
  teamId: string,
  organizationId: string,
) => {
  const jobId = `channel-${channelId}-${Date.now()}`;
  await backfillQueue.add(
    "backfill-channel",
    {
      type: "backfill-channel",
      channelId,
      channelName,
      teamId,
      organizationId,
    },
    { jobId },
  );
  console.log(`[Queue] Added channel backfill job: #${channelName}`);
};

// Helper to add thread backfill job
export const addThreadBackfillJob = async (
  channelId: string,
  threadTs: string,
  teamId: string,
  organizationId: string,
) => {
  const jobId = `thread-${threadTs}-${Date.now()}`;
  await backfillQueue.add(
    "backfill-thread",
    {
      type: "backfill-thread",
      channelId,
      threadTs,
      teamId,
      organizationId,
    },
    { jobId },
  );
  console.log(`[Queue] Added thread backfill job: ${threadTs}`);
};

// Graceful shutdown
export const closeBackfillQueue = async () => {
  if (backfillWorker) {
    await backfillWorker.close();
  }
  await backfillQueue.close();
  console.log("[Queue] Backfill queue closed");
};
