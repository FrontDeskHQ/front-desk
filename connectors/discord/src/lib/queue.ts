import { createQueue, createWorker } from "@connectors/framework/runtime";
import type { Job, Worker } from "@connectors/framework/runtime";
import type {
  Client,
  ForumChannel,
  TextChannel,
  ThreadChannel,
} from "discord.js";

import "../env";

// Job data types
export interface BackfillChannelJobData {
  type: "backfill-channel";
  channelId: string;
  channelName: string;
  guildId: string;
  organizationId: string;
  integrationId: string;
  archivedBefore?: string;
  activeProcessed?: boolean;
}

export interface BackfillThreadJobData {
  type: "backfill-thread";
  threadId: string;
  threadName: string;
  organizationId: string;
  integrationId: string;
}

export type BackfillJobData = BackfillChannelJobData | BackfillThreadJobData;

export interface BackfillChannelResult {
  hasMore: boolean;
  nextCursor?: string;
}

// Queue instance
export const backfillQueue = createQueue<BackfillJobData>("discord-backfill", {
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

// Worker setup - must be initialized with the Discord client
let backfillWorker: Worker<BackfillJobData> | null = null;

export interface BackfillHandlers {
  processChannel: (
    channel: TextChannel | ForumChannel,
    organizationId: string,
    integrationId: string,
    options: { archivedBefore?: string; activeProcessed?: boolean }
  ) => Promise<BackfillChannelResult>;
  processThread: (
    thread: ThreadChannel,
    organizationId: string
  ) => Promise<void>;
  onThreadBackfillComplete: (integrationId: string) => Promise<void>;
}

export const initializeBackfillWorker = (
  discordClient: Client,
  handlers: BackfillHandlers
) => {
  if (backfillWorker) {
    console.log("Backfill worker already initialized");
    return backfillWorker;
  }

  backfillWorker = createWorker<BackfillJobData>(
    "discord-backfill",
    async (job: Job<BackfillJobData>) => {
      const { data } = job;

      if (data.type === "backfill-channel") {
        const guild = discordClient.guilds.cache.get(data.guildId);
        if (!guild) {
          throw new Error(`Guild ${data.guildId} not found in cache`);
        }

        const channel = guild.channels.cache.get(data.channelId) as
          | TextChannel
          | ForumChannel
          | undefined;
        if (!channel) {
          throw new Error(`Channel ${data.channelId} not found in guild`);
        }

        console.log(
          `[Queue] Processing channel backfill: #${data.channelName}`
        );
        const result = await handlers.processChannel(
          channel,
          data.organizationId,
          data.integrationId,
          {
            activeProcessed: data.activeProcessed,
            archivedBefore: data.archivedBefore,
          }
        );

        // If there are more pages, queue the next page
        if (result.hasMore && result.nextCursor) {
          await addChannelBackfillJob(
            channel,
            data.guildId,
            data.organizationId,
            data.integrationId,
            { activeProcessed: true, archivedBefore: result.nextCursor }
          );
        }

        console.log(`[Queue] Completed channel backfill: #${data.channelName}`);
      } else if (data.type === "backfill-thread") {
        // Fetch the thread from Discord
        const thread = (await discordClient.channels.fetch(
          data.threadId
        )) as ThreadChannel | null;
        if (!thread) {
          throw new Error(`Thread ${data.threadId} not found`);
        }

        console.log(`[Queue] Processing thread backfill: ${data.threadName}`);
        await handlers.processThread(thread, data.organizationId);
        console.log(`[Queue] Completed thread backfill: ${data.threadName}`);
      }
    },
    {
      concurrency: 2, // Process 2 jobs at a time
      limiter: {
        duration: 60_000, // Per minute (Discord rate limits)
        max: 10, // Max 10 jobs
      },
    }
  );

  backfillWorker.on("completed", async (job) => {
    console.log(`[Queue] Job ${job.id} completed successfully`);
    if (job.data.type === "backfill-thread") {
      try {
        await handlers.onThreadBackfillComplete(job.data.integrationId);
      } catch (error) {
        console.error(
          `[Queue] onThreadBackfillComplete failed for job ${job.id}:`,
          error
        );
      }
    }
  });

  backfillWorker.on("failed", (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err.message);
  });

  backfillWorker.on("error", (err) => {
    console.error("[Queue] Worker error:", err);
  });

  console.log("[Queue] Backfill worker initialized");
  return backfillWorker;
};

// Helper to add channel backfill job
export const addChannelBackfillJob = async (
  channel: TextChannel | ForumChannel,
  guildId: string,
  organizationId: string,
  integrationId: string,
  options?: { archivedBefore?: string; activeProcessed?: boolean }
) => {
  const jobId = `channel-${channel.id}-${Date.now()}`;
  await backfillQueue.add(
    "backfill-channel",
    {
      activeProcessed: options?.activeProcessed,
      archivedBefore: options?.archivedBefore,
      channelId: channel.id,
      channelName: channel.name,
      guildId,
      integrationId,
      organizationId,
      type: "backfill-channel",
    },
    { jobId }
  );
  console.log(`[Queue] Added channel backfill job: #${channel.name}`);
};

// Helper to add thread backfill job
export const addThreadBackfillJob = async (
  thread: ThreadChannel,
  organizationId: string,
  integrationId: string
) => {
  const jobId = `thread-${thread.id}-${Date.now()}`;
  await backfillQueue.add(
    "backfill-thread",
    {
      integrationId,
      organizationId,
      threadId: thread.id,
      threadName: thread.name,
      type: "backfill-thread",
    },
    { jobId }
  );
  console.log(`[Queue] Added thread backfill job: ${thread.name}`);
};

// Graceful shutdown
export const closeBackfillQueue = async () => {
  if (backfillWorker) {
    await backfillWorker.close();
  }
  await backfillQueue.close();
  console.log("[Queue] Backfill queue closed");
};
