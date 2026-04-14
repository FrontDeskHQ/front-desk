import type { KnownBlock, WebClient } from "@slack/web-api";
import type { DigestNotifyJobData } from "@workspace/schemas/digest";
import { formatRelativeTime } from "@workspace/utils/format";
import { type Job, Worker } from "bullmq";
import "../env";

const DIGEST_NOTIFY_QUEUE = "digest-notify";
const MAX_ITEMS_PER_SECTION = 5;

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

let digestWorker: Worker<DigestNotifyJobData> | null = null;

export const initializeDigestWorker = (
  getClientForTeam: (teamId: string) => Promise<WebClient | null>,
) => {
  if (digestWorker) {
    console.log("[Slack] Digest worker already initialized");
    return digestWorker;
  }

  digestWorker = new Worker<DigestNotifyJobData>(
    DIGEST_NOTIFY_QUEUE,
    async (job: Job<DigestNotifyJobData>) => {
      const { orgId, teamId, channelId, payload } = job.data;

      console.log(
        `[Slack] Digest job ${job.id} received for org ${payload.orgName} (${orgId}), team ${teamId}, channel ${channelId}`,
      );
      console.log(
        `[Slack] Digest payload: metrics=${JSON.stringify(payload.metrics)}, pendingReply=${payload.pendingReply.length}, loopToClose=${payload.loopToClose.length}`,
      );

      const client = await getClientForTeam(teamId);
      if (!client) {
        console.error(
          `[Slack] Could not get Slack client for team ${teamId} (org ${payload.orgName})`,
        );
        throw new Error(`Could not get Slack client for team ${teamId}`);
      }
      console.log(`[Slack] Obtained WebClient for team ${teamId}`);

      const blocks = buildBlockKitMessage(payload);
      const text = buildFallbackText(payload);
      console.log(
        `[Slack] Built ${blocks.length} blocks, fallback text length=${text.length}`,
      );

      try {
        const result = await client.chat.postMessage({
          channel: channelId,
          blocks,
          text,
        });
        console.log(
          `[Slack] Digest posted to channel ${channelId} (ts=${result.ts}) for org ${payload.orgName}`,
        );
      } catch (err) {
        console.error(
          `[Slack] chat.postMessage failed for channel ${channelId} (org ${payload.orgName}):`,
          err,
        );
        throw err;
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  digestWorker.on("completed", (job) => {
    console.log(`[Slack] Digest job ${job.id} completed`);
  });

  digestWorker.on("failed", (job, err) => {
    console.error(`[Slack] Digest job ${job?.id} failed:`, err.message);
  });

  digestWorker.on("error", (err) => {
    console.error("[Slack] Digest worker error:", err);
  });

  console.log("[Slack] Digest worker initialized");
  return digestWorker;
};

export const closeDigestWorker = async () => {
  if (digestWorker) {
    await digestWorker.close();
    console.log("[Slack] Digest worker closed");
  }
};

function buildBlockKitMessage(
  payload: DigestNotifyJobData["payload"],
): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  const { metrics, pendingReply, loopToClose, orgName } = payload;

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `📊 Yesterday — ${orgName}`,
      emoji: true,
    },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `• ${metrics.newThreads} new threads\n• ${metrics.resolved} resolved\n• ${metrics.currentlyOpen} currently open`,
    },
  });

  if (pendingReply.length > 0) {
    blocks.push({ type: "divider" });

    const capped = pendingReply.slice(0, MAX_ITEMS_PER_SECTION);
    const lines = capped.map(
      (item) =>
        `• ${item.threadName} — ${formatRelativeTime(new Date(Date.now() - item.waitTimeMs))} (${item.customerName})`,
    );

    if (pendingReply.length > MAX_ITEMS_PER_SECTION) {
      lines.push(
        `_+ ${pendingReply.length - MAX_ITEMS_PER_SECTION} more in FrontDesk_`,
      );
    }

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*⚠️ Waiting for reply (${pendingReply.length})*\n${lines.join("\n")}`,
      },
    });
  }

  if (loopToClose.length > 0) {
    blocks.push({ type: "divider" });

    const capped = loopToClose.slice(0, MAX_ITEMS_PER_SECTION);
    const lines = capped.map(
      (item) =>
        `• ${item.threadName} — fix merged ${formatRelativeTime(new Date(Date.now() - item.timeSinceMergeMs))} (${item.prDisplayName})`,
    );

    if (loopToClose.length > MAX_ITEMS_PER_SECTION) {
      lines.push(
        `_+ ${loopToClose.length - MAX_ITEMS_PER_SECTION} more in FrontDesk_`,
      );
    }

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*✅ Loop to close (${loopToClose.length})*\n${lines.join("\n")}`,
      },
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `→ <https://tryfrontdesk.app/app/signal|Open FrontDesk>`,
    },
  });

  return blocks;
}

function buildFallbackText(payload: DigestNotifyJobData["payload"]): string {
  const parts = [`📊 Yesterday — ${payload.orgName}`];
  parts.push(
    `${payload.metrics.newThreads} new, ${payload.metrics.resolved} resolved, ${payload.metrics.currentlyOpen} open`,
  );

  if (payload.pendingReply.length > 0) {
    parts.push(`⚠️ ${payload.pendingReply.length} waiting for reply`);
  }
  if (payload.loopToClose.length > 0) {
    parts.push(`✅ ${payload.loopToClose.length} to loop to close`);
  }

  return parts.join(" | ");
}
