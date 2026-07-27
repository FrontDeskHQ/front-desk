import { createQueue, createWorker } from "@connectors/framework/runtime";
import type { Job, Worker } from "@connectors/framework/runtime";
import type { WebClient } from "@slack/web-api";

import "../env";

// Job data types adapted for Slack
export interface BackfillChannelJobData {
  type: "backfill-channel";
  channelId: string; // Slack channel ID
  channelName: string;
  teamId: string; // Slack workspace ID
  organizationId: string;
  integrationId: string;
  cursor?: string;
}

export interface BackfillThreadJobData {
  type: "backfill-thread";
  channelId: string; // Parent channel (needed for API calls)
  threadTs: string; // Thread parent timestamp
  teamId: string;
  organizationId: string;
  integrationId: string;
}

export type BackfillJobData = BackfillChannelJobData | BackfillThreadJobData;

export interface BackfillChannelResult {
  hasMore: boolean;
  nextCursor?: string;
}

// Queue instance
export const backfillQueue = createQueue<BackfillJobData>("slack-backfill", {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      delay: 1000,
      type: "exponential",
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

export interface BackfillHandlers {
  processChannel: (
    client: WebClient,
    channelId: string,
    teamId: string,
    organizationId: string,
    integrationId: string,
    options: { cursor?: string }
  ) => Promise<BackfillChannelResult>;
  processThread: (
    client: WebClient,
    channelId: string,
    threadTs: string,
    teamId: string,
    organizationId: string
  ) => Promise<void>;
  onThreadBackfillComplete: (integrationId: string) => Promise<void>;
}

export const initializeBackfillWorker = (
  getClientForTeam: (teamId: string) => Promise<WebClient | null>,
  handlers: BackfillHandlers
) => {
  if (backfillWorker) {
    console.log("[Slack] Backfill worker already initialized");
    return backfillWorker;
  }

  backfillWorker = createWorker<BackfillJobData>(
    "slack-backfill",
    async (job: Job<BackfillJobData>) => {
      const { data } = job;

      const client = await getClientForTeam(data.teamId);
      if (!client) {
        throw new Error(`Could not get client for team ${data.teamId}`);
      }

      if (data.type === "backfill-channel") {
        console.log(
          `[Queue] Processing channel backfill: #${data.channelName}`
        );
        const result = await handlers.processChannel(
          client,
          data.channelId,
          data.teamId,
          data.organizationId,
          data.integrationId,
          { cursor: data.cursor }
        );

        // If there are more pages, queue the next page
        if (result.hasMore && result.nextCursor) {
          await addChannelBackfillJob(
            data.channelId,
            data.channelName,
            data.teamId,
            data.organizationId,
            data.integrationId,
            result.nextCursor
          );
        }

        console.log(`[Queue] Completed channel backfill: #${data.channelName}`);
      } else if (data.type === "backfill-thread") {
        console.log(`[Queue] Processing thread backfill: ${data.threadTs}`);
        await handlers.processThread(
          client,
          data.channelId,
          data.threadTs,
          data.teamId,
          data.organizationId
        );
        console.log(`[Queue] Completed thread backfill: ${data.threadTs}`);
      }
    },
    {
      concurrency: 1, // Process 1 job at a time (more conservative for Slack)
      limiter: {
        duration: 60_000, // Per minute (Slack rate limits are stricter)
        max: 5, // Max 5 jobs
      },
    }
  );

  backfillWorker.on("completed", async (job) => {
    try {
      console.log(`[Queue] Job ${job.id} completed successfully`);
      if (job.data.type === "backfill-thread") {
        await handlers.onThreadBackfillComplete(job.data.integrationId);
      }
    } catch (error) {
      console.error(
        `[Queue] Job ${job.id} onThreadBackfillComplete failed:`,
        error
      );
    }
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
  integrationId: string,
  cursor?: string
) => {
  const jobId = `channel-${channelId}-${Date.now()}`;
  await backfillQueue.add(
    "backfill-channel",
    {
      channelId,
      channelName,
      cursor,
      integrationId,
      organizationId,
      teamId,
      type: "backfill-channel",
    },
    { jobId }
  );
  console.log(`[Queue] Added channel backfill job: #${channelName}`);
};

// Helper to add thread backfill job
export const addThreadBackfillJob = async (
  channelId: string,
  threadTs: string,
  teamId: string,
  organizationId: string,
  integrationId: string
) => {
  const jobId = `thread-${threadTs}-${Date.now()}`;
  await backfillQueue.add(
    "backfill-thread",
    {
      channelId,
      integrationId,
      organizationId,
      teamId,
      threadTs,
      type: "backfill-thread",
    },
    { jobId }
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
