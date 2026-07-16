import "./env";

import {
  buildPortalThreadUrl,
  type OutboundMessage,
  type OutboundUpdate,
  safeParseJSON,
  startOutboundReplication,
} from "@connectors/framework/runtime";
import type {
  AllMiddlewareArgs,
  AuthorizeResult,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";
import { parse } from "@workspace/utils/md-tiptap";
import { stringify } from "@workspace/utils/tiptap-md";
import { z } from "zod";
import { closeDigestWorker, initializeDigestWorker } from "./lib/digest-queue";
import { reflagClient } from "./lib/feature-flag";
import { installationStore } from "./lib/installation-store";
import { fetchClient, store } from "./lib/live-state";
import type { BackfillChannelResult } from "./lib/queue";
import {
  addChannelBackfillJob,
  addThreadBackfillJob,
  closeBackfillQueue,
  initializeBackfillWorker,
} from "./lib/queue";
import {
  getBackfillLimit,
  safeParseIntegrationSettings,
  updateBackfillStatus,
  updateSyncedChannels,
  withBackfillLock,
} from "./lib/utils";

/** Thread `externalMetadataStr` shape — a non-empty Slack channel id. */
const externalMetadataSchema = z.object({ channelId: z.string().min(1) });

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  customRoutes: [
    {
      path: "/api/channels",
      method: ["GET"],
      handler: async (req, res) => {
        try {
          const expectedKey = process.env.DISCORD_BOT_KEY;
          const providedKey = req.headers["x-discord-bot-key"];
          if (
            !expectedKey ||
            typeof providedKey !== "string" ||
            providedKey !== expectedKey
          ) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
            return;
          }

          const url = new URL(req.url ?? "", "http://localhost");
          const teamId = url.searchParams.get("team_id");
          if (!teamId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "MISSING_TEAM_ID" }));
            return;
          }

          const client = await getClientForTeam(teamId);
          if (!client) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "INSTALLATION_NOT_FOUND" }));
            return;
          }

          const channels: Array<{
            id: string;
            name: string;
            isPrivate: boolean;
          }> = [];
          let cursor: string | undefined;
          do {
            const result = await client.conversations.list({
              types: "public_channel,private_channel",
              limit: 200,
              exclude_archived: true,
              cursor,
            });

            for (const c of result.channels ?? []) {
              if (!c.id || !c.name) continue;
              channels.push({
                id: c.id,
                name: c.name,
                isPrivate: !!c.is_private,
              });
            }

            cursor = result.response_metadata?.next_cursor || undefined;
          } while (cursor);

          channels.sort((a, b) => a.name.localeCompare(b.name));

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ channels }));
        } catch (error) {
          console.error("[Slack] /api/channels error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "SLACK_API_ERROR" }));
        }
      },
    },
  ],
  authorize: async ({ teamId, enterpriseId }): Promise<AuthorizeResult> => {
    try {
      const installation = await installationStore.fetchInstallation({
        teamId: teamId ?? undefined,
        enterpriseId: enterpriseId ?? undefined,
        isEnterpriseInstall: !!enterpriseId,
      });

      const installationData = installation as {
        bot?: { token?: string; id?: string; user_id?: string };
        access_token?: string;
        team?: { id?: string };
        enterprise?: { id?: string };
        user?: { token?: string };
      };

      const botToken =
        installationData.bot?.token ?? installationData.access_token ?? null;

      if (!botToken) {
        throw new Error(
          `Bot token not found in installation for teamId: ${teamId}`,
        );
      }

      return {
        botToken,
        botId: installationData.bot?.id ?? undefined,
        botUserId: installationData.bot?.user_id ?? undefined,
        teamId: installationData.team?.id ?? teamId ?? undefined,
        enterpriseId:
          installationData.enterprise?.id ?? enterpriseId ?? undefined,
        userToken: installationData.user?.token ?? undefined,
      };
    } catch (error) {
      console.error(
        `[Slack] Authorization failed for teamId: ${teamId}`,
        error,
      );
      throw error;
    }
  },
});

type RelatedThreadLink = {
  threadId: string;
  name: string | null;
  url: string;
};

const RELATED_THREADS_INITIAL_DELAY_MS = 30000;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// TODO(signals-overhaul): related-threads polling used the dropped `suggestion`
// table. Rebuild on the new pipeline before re-enabling the related-threads
// section of the portal bot reply.
const getRelatedThreadLinks = async (_args: {
  organizationId: string;
  organizationSlug: string;
  threadId: string;
  baseUrl: string;
}): Promise<RelatedThreadLink[]> => {
  return [];
};

const sanitizeSlackLinkLabel = (label: string): string => {
  return label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "-");
};

const buildPortalBotText = ({
  portalUrl,
  relatedThreadLinks,
}: {
  portalUrl: string;
  relatedThreadLinks: RelatedThreadLink[];
}) => {
  const lines = [
    `This thread is also being tracked in our community portal: <${portalUrl}|${sanitizeSlackLinkLabel("Open in portal")}>`,
  ];

  if (relatedThreadLinks.length > 0) {
    lines.push("");
    lines.push("Related threads on the portal:");
    for (const link of relatedThreadLinks) {
      if (link.name) {
        const sanitizedName = sanitizeSlackLinkLabel(link.name);
        lines.push(`• <${link.url}|${sanitizedName}>`);
      } else {
        lines.push(`• <${link.url}>`);
      }
    }
  }

  return lines.join("\n");
};

const buildPortalBotBlocks = ({
  portalUrl,
  relatedThreadLinks,
}: {
  portalUrl: string;
  relatedThreadLinks: RelatedThreadLink[];
}) => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: buildPortalBotText({ portalUrl, relatedThreadLinks }),
    },
  },
];

const getClientForTeam = async (teamId: string): Promise<WebClient | null> => {
  try {
    const installation = await installationStore.fetchInstallation({
      teamId,
      enterpriseId: undefined,
      isEnterpriseInstall: false,
    });

    const installationData = installation as {
      bot?: { token?: string; id?: string; user_id?: string };
      access_token?: string;
      team?: { id?: string };
      enterprise?: { id?: string };
    };

    const botToken =
      installationData.bot?.token ?? installationData.access_token ?? null;

    if (!botToken) {
      console.error(
        `Bot token not found in installation for teamId: ${teamId}`,
      );
      return null;
    }

    return new WebClient(botToken);
  } catch (error) {
    console.error(`Failed to get client for teamId: ${teamId}`, error);
    return null;
  }
};

/** Integration `type` / `support-entry-point` provider key for this connector. */
const SLACK_PROVIDER = "slack";

/**
 * Resolve a raw Slack user id → display name. This is the un-liftable provider
 * work (an async Slack API lookup) that stays in the connector per ADR-0009; it
 * feeds the neutral `author` descriptor whose `externalId` the core prefixes
 * with `provider:` to form the author `metaId`.
 */
const resolveSlackAuthor = async (
  client: WebClient,
  slackUserId: string,
): Promise<{ externalId: string; name: string }> => {
  let userName = "Unknown";
  try {
    const userInfo = await client.users.info({ user: slackUserId });
    if (userInfo.ok && userInfo.user) {
      userName = userInfo.user.real_name || userInfo.user.name || "Unknown";
    }
  } catch (error) {
    console.error(
      `[Slack] Error fetching user info for ${slackUserId}:`,
      error,
    );
  }

  return { externalId: slackUserId, name: userName };
};

const ensureThreadTitle = (title: string) =>
  title.length >= 3 ? title : title.padEnd(3, ".");

/**
 * Translate a Slack message into a `support-entry-point` ingest call. The core
 * owns create-vs-append, `externalMessageId` dedup, author identity and
 * `provider:` prefixing; the connector only supplies neutral shapes.
 *
 * Slack's thread-root detection rides the optional `thread` descriptor: unlike
 * Discord (which cheaply knows the channel title and attaches it every time),
 * Slack only knows a message is a thread root when it carries no `thread_ts`, so
 * `threadTitle` is passed only then. On a reply the descriptor is omitted and the
 * core appends to the thread it already has for `externalThreadId`.
 */
const ingestSlackMessage = (args: {
  organizationId: string;
  externalThreadId: string;
  channelId: string;
  ts: string;
  text: string;
  author: { externalId: string; name: string };
  threadTitle?: string;
  isBackfill?: boolean;
}) =>
  fetchClient.mutate.ingest.ingest({
    organizationId: args.organizationId,
    provider: SLACK_PROVIDER,
    externalThreadId: args.externalThreadId,
    thread: args.threadTitle
      ? {
          title: ensureThreadTitle(args.threadTitle),
          externalMetadata: { channelId: args.channelId },
        }
      : undefined,
    message: {
      externalMessageId: args.ts,
      body: parse(args.text || ""),
      createdAt: new Date(Number.parseFloat(args.ts) * 1000),
    },
    author: {
      externalId: args.author.externalId,
      name: args.author.name,
    },
    isBackfill: args.isBackfill ?? false,
  });

/** First 100 chars of the root message, falling back to a channel-based title. */
const slackThreadTitle = (rootText: string | undefined, fallback: string) =>
  rootText && rootText.length > 0 ? rootText.substring(0, 100) : fallback;

/**
 * Backfill a single Slack thread and its messages through `mutate.ingest`. The
 * ingest procedure is idempotent (create-vs-append + `externalMessageId` dedup
 * owned by the core), so this one path covers both a first-time thread and a
 * re-added channel — no connector-side `byExternalId` / thread-existence checks.
 * The Slack root message (its `ts` equals `threadTs`) carries the thread
 * descriptor; the replies omit it and append.
 */
const backfillThread = async (
  client: WebClient,
  channelId: string,
  threadTs: string,
  _teamId: string,
  organizationId: string,
): Promise<void> => {
  // Fetch all messages in the thread using conversations.replies with pagination
  const messages: MessageElement[] = [];
  let cursor: string | undefined;

  do {
    const replies = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 200,
      cursor,
    });

    if (!replies.ok || !replies.messages) {
      if (messages.length === 0) {
        console.log(`    [Slack] No messages found for thread ${threadTs}`);
        return;
      }
      break;
    }

    messages.push(...replies.messages);
    cursor = replies.response_metadata?.next_cursor;
  } while (cursor);

  // conversations.replies returns the root message first; the thread cannot be
  // created without it. If the root is a bot/system message, skip the whole
  // thread rather than hand the core a message for an unknown thread with no
  // descriptor (which it would reject).
  const rootMessage = messages[0];
  if (!rootMessage || rootMessage.bot_id || !rootMessage.user) {
    console.log(`    [Slack] Skipping bot thread ${threadTs}`);
    return;
  }

  const sortedMessages = messages
    .filter(
      (m): m is MessageElement & { ts: string; user: string } =>
        !m.bot_id && !!m.user && !!m.ts,
    )
    .sort((a, b) => Number.parseFloat(a.ts) - Number.parseFloat(b.ts));

  // Ingest in chronological order: the root (ts === threadTs) creates the thread
  // with its descriptor, the rest append. The core dedups any already-ingested
  // message, so re-added channels only add what's missing.
  for (const msg of sortedMessages) {
    const author = await resolveSlackAuthor(client, msg.user);
    const isRoot = msg.ts === threadTs;
    await ingestSlackMessage({
      organizationId,
      externalThreadId: threadTs,
      channelId,
      ts: msg.ts,
      text: msg.text || "",
      author,
      threadTitle: isRoot
        ? slackThreadTitle(msg.text, "Slack Thread")
        : undefined,
      isBackfill: true,
    });
  }

  console.log(`    [Slack] Synced ${sortedMessages.length} messages`);
};

/**
 * Backfill threads from a Slack channel (single page)
 * Returns { hasMore, nextCursor } so the worker can queue the next page
 */
const backfillChannel = async (
  client: WebClient,
  channelId: string,
  teamId: string,
  organizationId: string,
  integrationId: string,
  options: { cursor?: string },
): Promise<BackfillChannelResult> => {
  console.log(`  [Slack] Fetching messages from channel ${channelId}...`);

  try {
    // Fetch one page of history
    const result = await client.conversations.history({
      channel: channelId,
      limit: 100,
      ...(options.cursor ? { cursor: options.cursor } : {}),
    });

    if (!result.ok || !result.messages) {
      console.error(
        `  [Slack] Failed to fetch history for channel ${channelId}`,
      );
      return { hasMore: false };
    }

    // Filter threads with replies
    const threadTimestamps = result.messages
      .filter((msg) => msg.reply_count && msg.reply_count > 0 && msg.ts)
      .map((msg) => msg.ts!);

    // Check budget and queue thread jobs (all inside lock so total stays accurate if enqueue fails)
    let queuedCount = 0;
    await withBackfillLock(integrationId, async () => {
      const integration = await fetchClient.query.integration.byId({
        id: integrationId,
      });
      const currentSettings = safeParseIntegrationSettings(
        integration?.configStr ?? null,
      );
      const existingBackfill = currentSettings?.backfill;
      const limit = existingBackfill?.limit ?? null;
      const currentTotal = existingBackfill?.total ?? 0;

      // Check budget
      const threadsToQueue: string[] = [];
      let remaining =
        limit !== null ? limit - currentTotal : threadTimestamps.length;
      for (const ts of threadTimestamps) {
        if (remaining <= 0) break;
        threadsToQueue.push(ts);
        remaining--;
      }

      if (threadsToQueue.length > 0) {
        // Queue thread backfill jobs before updating total (ensures no drift on enqueue failure)
        for (const ts of threadsToQueue) {
          await addThreadBackfillJob(
            channelId,
            ts,
            teamId,
            organizationId,
            integrationId,
          );
        }

        const newTotal = currentTotal + threadsToQueue.length;
        await updateBackfillStatus(
          integrationId,
          integration?.configStr ?? null,
          {
            processed: existingBackfill?.processed ?? 0,
            total: newTotal,
            limit: existingBackfill?.limit ?? null,
            channelsDiscovering: existingBackfill?.channelsDiscovering ?? 0,
          },
        );
      }

      queuedCount = threadsToQueue.length;
    });

    console.log(
      `  [Slack] Queued ${queuedCount} threads for backfill from channel ${channelId}`,
    );

    // Determine if there are more pages
    const budgetExhausted = await (async () => {
      const integration = await fetchClient.query.integration.byId({
        id: integrationId,
      });
      const settings = safeParseIntegrationSettings(
        integration?.configStr ?? null,
      );
      const limit = settings?.backfill?.limit ?? null;
      const total = settings?.backfill?.total ?? 0;
      return limit !== null && total >= limit;
    })();

    const nextCursor = result.response_metadata?.next_cursor;
    const hasMorePages = !!nextCursor;

    if (!hasMorePages || budgetExhausted) {
      // This channel is done discovering — decrement channelsDiscovering
      await withBackfillLock(integrationId, async () => {
        const integration = await fetchClient.query.integration.byId({
          id: integrationId,
        });
        const settings = safeParseIntegrationSettings(
          integration?.configStr ?? null,
        );
        const backfill = settings?.backfill;
        if (backfill) {
          const newChannelsDiscovering = Math.max(
            0,
            backfill.channelsDiscovering - 1,
          );
          if (
            newChannelsDiscovering === 0 &&
            backfill.processed >= backfill.total
          ) {
            await updateBackfillStatus(
              integrationId,
              integration?.configStr ?? null,
              null,
            );
          } else {
            await updateBackfillStatus(
              integrationId,
              integration?.configStr ?? null,
              {
                ...backfill,
                channelsDiscovering: newChannelsDiscovering,
              },
            );
          }
        }
      });

      return { hasMore: false };
    }

    return { hasMore: true, nextCursor };
  } catch (error) {
    console.error(`  [Slack] Error backfilling channel ${channelId}:`, error);
    throw error;
  }
};

/**
 * Handle integration changes - triggers backfill when channels are added
 * Uses persisted syncedChannels instead of in-memory Map
 */
const handleIntegrationChanges = async (
  integrations: {
    id: string;
    organizationId: string;
    configStr: string | null;
  }[],
): Promise<void> => {
  for (const integration of integrations) {
    try {
      const settings = safeParseIntegrationSettings(integration.configStr);
      if (!settings?.teamId) continue;
      const teamId = settings.teamId;

      const selectedChannels = settings.selectedChannels ?? [];
      const currentChannelIds = new Set(selectedChannels.map((c) => c.id));
      let syncedChannels = new Set(settings.syncedChannels ?? []);

      // Migration: if syncedChannels is undefined, initialize from current selectedChannels
      // This prevents false trigger on first deploy with new code
      if (settings.syncedChannels === undefined) {
        await updateSyncedChannels(integration.id, [...currentChannelIds]);
        continue;
      }

      // Cleanup: remove channels from syncedChannels that are no longer in selectedChannels
      // This ensures re-adding a channel later triggers a fresh backfill
      const cleanedSynced = [...syncedChannels].filter((id) =>
        currentChannelIds.has(id),
      );
      if (cleanedSynced.length !== syncedChannels.size) {
        syncedChannels = new Set(cleanedSynced);
        await updateSyncedChannels(integration.id, cleanedSynced);
      }

      // Find newly added channels (in selected but not in synced)
      const addedChannels = selectedChannels.filter(
        (c) => !syncedChannels.has(c.id),
      );

      if (addedChannels.length === 0) continue;

      // Check if backfill feature is enabled for this organization
      const { isEnabled: isBackfillEnabled } = reflagClient
        .bindClient({ company: { id: integration.organizationId } })
        .getFlag("backfill-threads");
      if (!isBackfillEnabled) {
        console.log(
          `[Slack] Backfill disabled via feature flag, skipping ${addedChannels.length} channel(s)`,
        );
        // Still mark as synced so we don't re-check on restart
        const newSynced = [
          ...syncedChannels,
          ...addedChannels.map((c) => c.id),
        ];
        await updateSyncedChannels(integration.id, newSynced);
        continue;
      }

      console.log(
        `[Slack] Detected ${addedChannels.length} new channel(s) for integration ${integration.id}: ${addedChannels.map((c) => c.name).join(", ")}`,
      );

      // Query plan limit
      const limit = await getBackfillLimit(integration.organizationId);

      // Add new channels to syncedChannels immediately (at backfill START)
      // BullMQ handles retries for in-progress jobs
      const newSynced = [...syncedChannels, ...addedChannels.map((c) => c.id)];
      await updateSyncedChannels(integration.id, newSynced);

      const channelsToQueue = addedChannels.map((c) => ({
        channelId: c.id,
        name: c.name,
      }));

      if (channelsToQueue.length === 0) continue;

      // Initialize/accumulate backfill status
      await withBackfillLock(integration.id, async () => {
        const latestIntegration = await fetchClient.query.integration.byId({
          id: integration.id,
        });
        const latestSettings = safeParseIntegrationSettings(
          latestIntegration?.configStr ?? null,
        );
        const existingBackfill = latestSettings?.backfill;

        await updateBackfillStatus(
          integration.id,
          latestIntegration?.configStr ?? null,
          {
            processed: existingBackfill?.processed ?? 0,
            total: existingBackfill?.total ?? 0,
            limit: existingBackfill?.limit ?? limit,
            channelsDiscovering:
              (existingBackfill?.channelsDiscovering ?? 0) +
              channelsToQueue.length,
          },
        );

        // Queue first backfill-channel job (no cursor) for each new channel
        for (const { channelId, name } of channelsToQueue) {
          await addChannelBackfillJob(
            channelId,
            name,
            teamId,
            integration.organizationId,
            integration.id,
          );
        }
      });
    } catch (error) {
      console.error(
        `[Slack] Error processing integration ${integration.id}:`,
        error,
      );
    }
  }
};

app.message(
  async ({
    message,
    ack,
    say,
    client,
  }: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs) => {
    // Slack SDK is VERY BAD
    if (ack && typeof ack === "function") await (ack as () => Promise<void>)();

    if (!("user" in message) || !message.user) return;

    // Filter out bot messages and system messages (any message with a subtype)
    if (message.subtype || "bot_id" in message || "bot_profile" in message)
      return;

    const isFirstMessage = !("thread_ts" in message);

    const conversation = await client.conversations.info({
      channel: message.channel,
    });

    if (!conversation.ok || !conversation.channel) return;

    const channelName = conversation.channel.name;
    if (!channelName) return;

    const teamId = conversation.channel.context_team_id;
    const integration = store.query.integration
      .where({ type: "slack" })
      .get()
      .find((i) => {
        const parsed = safeParseIntegrationSettings(i.configStr);
        return parsed?.teamId === teamId;
      });

    if (!integration) return;

    const integrationSettings = safeParseIntegrationSettings(
      integration.configStr,
    );

    const channelId = conversation.channel.id;
    if (
      !channelId ||
      !(integrationSettings?.selectedChannels ?? []).some(
        (c) => c.id === channelId,
      )
    ) {
      return;
    }

    const author = await resolveSlackAuthor(client, message.user);
    const messageText = "text" in message ? message.text : undefined;

    // `externalThreadId` is the root `ts` in both cases — the reply carries it
    // as `thread_ts`.
    const externalThreadId = isFirstMessage ? message.ts : message.thread_ts;
    if (!externalThreadId) return;

    // Always attach a thread descriptor, like the Discord connector: the core
    // ignores it once the thread exists (append path), so it only bootstraps a
    // thread when one doesn't yet exist. This makes ingest resilient to Slack's
    // non-guaranteed delivery order — a reply that arrives before its root no
    // longer hard-errors, it creates the thread with a channel-name fallback
    // title instead. A root message still titles the thread from its own text.
    const threadTitle = isFirstMessage
      ? slackThreadTitle(messageText, channelName)
      : channelName;

    // One idempotent ingest call: the core creates the thread on the first
    // message it sees for `externalThreadId` and appends thereafter (no timing
    // heuristic, no dedup here).
    const { thread, created } = await ingestSlackMessage({
      organizationId: integration.organizationId,
      externalThreadId,
      channelId: message.channel,
      ts: message.ts,
      text: messageText || "",
      author,
      threadTitle,
    });

    if (!thread) return;
    const threadId = thread.id;

    // The portal-link reply is posted once, when the thread is first created.
    if (!created) return;

    try {
      const organization = await fetchClient.query.organization.byId({
        id: integration.organizationId,
      });

      if (organization?.slug) {
        const showPortalMessage =
          integrationSettings?.showPortalMessage !== false;

        if (showPortalMessage) {
          const baseUrl = process.env.BASE_URL ?? "https://tryfrontdesk.app";
          const portalUrl = buildPortalThreadUrl(
            baseUrl,
            organization.slug,
            threadId,
          );
          const portalText = buildPortalBotText({
            portalUrl,
            relatedThreadLinks: [],
          });
          const portalBlocks = buildPortalBotBlocks({
            portalUrl,
            relatedThreadLinks: [],
          });

          const postResult = await say({
            text: portalText,
            blocks: portalBlocks,
            channel: message.channel,
            // Nest under the root, not this event's `ts`: when a reply bootstraps
            // the thread, `message.ts` is the reply — the portal message must
            // still thread onto the root (`externalThreadId`).
            thread_ts: externalThreadId,
          });

          void (async () => {
            try {
              await sleep(RELATED_THREADS_INITIAL_DELAY_MS);

              const relatedThreadLinks = await getRelatedThreadLinks({
                organizationId: integration.organizationId,
                organizationSlug: organization.slug,
                threadId,
                baseUrl,
              });

              if (relatedThreadLinks.length === 0) return;

              const updatedText = buildPortalBotText({
                portalUrl,
                relatedThreadLinks,
              });
              const updatedBlocks = buildPortalBotBlocks({
                portalUrl,
                relatedThreadLinks,
              });

              if (!postResult?.ts) return;

              await client.chat.update({
                channel: message.channel,
                ts: postResult.ts,
                text: updatedText,
                blocks: updatedBlocks,
              });
            } catch (error) {
              console.error("Error updating portal link message:", error);
            }
          })();
        }
      }
    } catch (error) {
      console.error("Error sending portal link message:", error);
    }
  },
);

/**
 * Resolve the Slack workspace client + channel/thread a normalized thread maps
 * to, or `null` if this connector can't currently deliver to it. The parent
 * channel id lives in the thread's `externalMetadataStr`; the thread ts on
 * `externalId`.
 */
const resolveSlackTarget = async (thread: {
  organizationId?: string;
  externalId?: string | null;
  externalMetadataStr?: string | null;
}): Promise<{
  client: WebClient;
  channelId: string;
  threadTs: string;
} | null> => {
  const integration = store.query.integration
    .first({ organizationId: thread?.organizationId, type: "slack" })
    .get();
  if (!integration || !integration.configStr) return null;

  const parsedConfig = safeParseIntegrationSettings(integration.configStr);
  const teamId = parsedConfig?.teamId;
  if (!teamId) return null;

  const threadTs = thread.externalId;
  if (!threadTs) return null;

  let channelId: string | null = null;
  if (thread.externalMetadataStr) {
    try {
      const metadata = externalMetadataSchema.parse(
        JSON.parse(thread.externalMetadataStr),
      );
      channelId = metadata.channelId;
    } catch (error) {
      console.error("Error parsing externalMetadataStr:", error);
    }
  }
  if (!channelId) return null;

  const client = await getClientForTeam(teamId);
  if (!client) return null;

  return { client, channelId, threadTs };
};

/**
 * Deliver one outbound reply to Slack. Returns the message `ts` to round-trip,
 * or `null` to leave it for the next pass.
 */
const deliverSlackMessage = async (
  message: OutboundMessage,
): Promise<string | null> => {
  const target = await resolveSlackTarget(message.thread);
  if (!target) return null;

  try {
    const result = await target.client.chat.postMessage({
      channel: target.channelId,
      text: stringify(safeParseJSON(message.content), {
        heading: true,
        horizontalRule: true,
      }),
      thread_ts: target.threadTs,
      username: message.author.name,
      icon_url: message.author?.user?.image ?? undefined,
    });

    return result.ok && result.ts ? result.ts : null;
  } catch (error) {
    console.error("Error sending Slack message:", error);
    return null;
  }
};

const formatUpdateMessage = (update: OutboundUpdate): string => {
  let metadata: Record<string, unknown> | null = null;
  if (update.metadataStr) {
    try {
      metadata = JSON.parse(update.metadataStr) as Record<string, unknown>;
    } catch (error) {
      console.error("Error parsing update metadata:", error);
    }
  }
  const userName = update.user?.name ?? metadata?.userName ?? "Someone";

  if (update.type === "status_changed") {
    return `*${userName}* changed status to *${
      metadata?.newStatusLabel ?? "unknown"
    }*`;
  }

  if (update.type === "priority_changed") {
    return `*${userName}* changed priority to *${
      metadata?.newPriorityLabel ?? "unknown"
    }*`;
  }

  if (update.type === "assigned_changed") {
    if (!metadata?.newAssignedUserName) {
      return `*${userName}* unassigned the thread`;
    }
    return `*${userName}* assigned the thread to *${metadata.newAssignedUserName}*`;
  }

  return `*${userName}* updated the thread`;
};

/**
 * Deliver one outbound thread update to Slack as a threaded message. Returns the
 * message `ts` to round-trip, or `null` to leave it un-replicated. The
 * framework's outbound helper owns the replicated-check and in-flight dedup.
 */
const deliverSlackUpdate = async (
  update: OutboundUpdate,
): Promise<string | null> => {
  const target = await resolveSlackTarget(update.thread);
  if (!target) return null;

  const result = await target.client.chat.postMessage({
    channel: target.channelId,
    text: formatUpdateMessage(update),
    thread_ts: target.threadTs,
  });

  return result.ok && result.ts ? result.ts : null;
};

(async () => {
  // Initialize Reflag client for feature flags
  await reflagClient.initialize();
  console.log("[Slack] Reflag initialized");

  await app.start(process.env.PORT || 3011);

  app.logger.info(
    `⚡️ Bolt app is running at port ${process.env.PORT || 3011}!`,
  );

  // Initialize the backfill worker
  initializeBackfillWorker(getClientForTeam, {
    processChannel: backfillChannel,
    processThread: backfillThread,
    onThreadBackfillComplete: async (integrationId: string) => {
      await withBackfillLock(integrationId, async () => {
        const integration = await fetchClient.query.integration.byId({
          id: integrationId,
        });
        const settings = safeParseIntegrationSettings(
          integration?.configStr ?? null,
        );
        const backfill = settings?.backfill;
        if (!backfill) return;

        const currentProcessed = backfill.processed + 1;

        if (
          backfill.channelsDiscovering === 0 &&
          currentProcessed >= backfill.total
        ) {
          await updateBackfillStatus(
            integrationId,
            integration?.configStr ?? null,
            null,
          );
        } else {
          await updateBackfillStatus(
            integrationId,
            integration?.configStr ?? null,
            {
              ...backfill,
              processed: currentProcessed,
            },
          );
        }
      });
    },
  });

  // Initialize the digest delivery worker
  initializeDigestWorker(getClientForTeam);

  setTimeout(async () => {
    // Watch un-replicated outbound messages/updates for Slack threads and
    // deliver them; the framework owns the round-trip of external message ids.
    // Slack additionally requires the parent channel id in externalMetadataStr.
    await startOutboundReplication({
      store,
      fetchClient,
      provider: "slack",
      threadFilter: { externalMetadataStr: { $not: null } },
      deliverMessage: deliverSlackMessage,
      deliverUpdate: deliverSlackUpdate,
    });

    // Subscribe to Slack integrations to trigger backfill when channels are added
    store.query.integration
      .where({ type: "slack" })
      .subscribe(handleIntegrationChanges);
  }, 1000);
})();

// Graceful shutdown
const shutdown = async () => {
  console.log("[Slack] Shutting down...");
  await reflagClient.flush();
  await closeBackfillQueue();
  await closeDigestWorker();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
