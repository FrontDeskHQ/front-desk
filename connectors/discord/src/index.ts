import {
  buildPortalThreadUrl,
  startOutboundReplication,
} from "@connectors/framework/runtime";
import type {
  OutboundMessage,
  OutboundUpdate,
} from "@connectors/framework/runtime";
import { parse } from "@workspace/utils/md-tiptap";
import { stringify } from "@workspace/utils/tiptap-md";
import { ChannelType, Client, GatewayIntentBits } from "discord.js";
import type {
  ForumChannel,
  Message,
  TextChannel,
  ThreadChannel,
} from "discord.js";

import "./env";
import { reflagClient } from "./lib/feature-flag";
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
  parseContentAsMarkdown,
  safeParseIntegrationSettings,
  safeParseJSON,
  updateBackfillStatus,
  updateSyncedChannels,
  withBackfillLock,
} from "./lib/utils";
import { getOrCreateWebhook } from "./utils";

/** Integration `type` / `support-entry-point` provider key for this connector. */
const DISCORD_PROVIDER = "discord";

const ensureThreadTitle = (title: string) =>
  title.length >= 3 ? title : title.padEnd(3, ".");

const token = process.env.DISCORD_TOKEN;

interface RelatedThreadLink {
  threadId: string;
  name: string | null;
  url: string;
}

const RELATED_THREADS_INITIAL_DELAY_MS = 30_000;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// TODO(signals-overhaul): related-threads polling used the dropped `suggestion`
// table. Rebuild on top of the new pipeline (issue 06 synthesis or a fresh
// related-threads source) before re-enabling the bot's related-threads embed.
const getRelatedThreadLinks = async (_args: {
  organizationId: string;
  organizationSlug: string;
  threadId: string;
  baseUrl: string;
}): Promise<RelatedThreadLink[]> => [];

const buildPortalBotEmbed = ({
  portalUrl,
  relatedThreadLinks,
}: {
  portalUrl: string;
  relatedThreadLinks: RelatedThreadLink[];
}) => {
  const lines = [
    `This thread is also being tracked in our community portal: <${portalUrl}>`,
  ];

  if (relatedThreadLinks.length > 0) {
    lines.push("", "Related threads:");
    for (const link of relatedThreadLinks) {
      if (link.name) {
        lines.push(`- [${link.name}](${link.url})`);
      } else {
        lines.push(`- ${link.url}`);
      }
    }
  }

  return {
    description: lines.join("\n"),
  };
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
  ],
});

/**
 * Translate a Discord message into a `support-entry-point` ingest call. The core
 * owns create-vs-append, dedup, author identity and `provider:` prefixing; the
 * connector only supplies neutral shapes plus the thread descriptor (Discord
 * cheaply knows the channel title, so it is attached on every call and the core
 * ignores it once the thread exists). Author display-name resolution stays here.
 */
const ingestDiscordMessage = (args: {
  organizationId: string;
  externalThreadId: string;
  title: string;
  message: Message;
  isBackfill?: boolean;
}) =>
  fetchClient.mutate.ingest.ingest({
    author: {
      externalId: args.message.author.id,
      name: args.message.author.displayName,
    },
    externalThreadId: args.externalThreadId,
    isBackfill: args.isBackfill ?? false,
    message: {
      body: parse(parseContentAsMarkdown(args.message)),
      createdAt: args.message.createdAt,
      externalMessageId: args.message.id,
    },
    organizationId: args.organizationId,
    provider: DISCORD_PROVIDER,
    thread: {
      externalMetadata: { channelId: args.externalThreadId },
      title: ensureThreadTitle(args.title),
    },
  });

/**
 * Backfill threads from a specific Discord channel (page-based)
 * Returns { hasMore, nextCursor } so the worker can queue the next page
 */
const backfillChannel = async (
  channel: TextChannel | ForumChannel,
  organizationId: string,
  integrationId: string,
  options: { archivedBefore?: string; activeProcessed?: boolean }
): Promise<BackfillChannelResult> => {
  console.log(`  Fetching threads from #${channel.name}...`);

  try {
    const threads: ThreadChannel[] = [];

    // On first page, fetch active threads
    if (!options.activeProcessed) {
      const activeThreads = await channel.threads.fetchActive();
      threads.push(...activeThreads.threads.values());
    }

    // Fetch one page of archived threads
    const archivedResult = await channel.threads.fetchArchived({
      limit: 100,
      ...(options.archivedBefore
        ? { before: new Date(options.archivedBefore) }
        : {}),
    });
    threads.push(...archivedResult.threads.values());

    console.log(`    Found ${threads.length} threads on this page`);

    // Check budget and queue thread jobs (all inside lock so total stays accurate if enqueue fails)
    const budgetExhausted = await withBackfillLock(integrationId, async () => {
      const integration = await fetchClient.query.integration.byId({
        id: integrationId,
      });
      const currentSettings = safeParseIntegrationSettings(
        integration?.configStr ?? null
      );
      const existingBackfill = currentSettings?.backfill;
      const limit = existingBackfill?.limit ?? null;
      const currentTotal = existingBackfill?.total ?? 0;

      // Check budget
      const threadsToQueue: ThreadChannel[] = [];
      let remaining = limit === null ? threads.length : limit - currentTotal;
      for (const thread of threads) {
        if (remaining <= 0) {
          break;
        }
        threadsToQueue.push(thread);
        remaining--;
      }

      // Queue thread backfill jobs before updating total (ensures no drift on enqueue failure)
      for (const thread of threadsToQueue) {
        await addThreadBackfillJob(thread, organizationId, integrationId);
      }

      const newTotal = currentTotal + threadsToQueue.length;
      await updateBackfillStatus(
        integrationId,
        integration?.configStr ?? null,
        {
          channelsDiscovering: existingBackfill?.channelsDiscovering ?? 0,
          limit: existingBackfill?.limit ?? null,
          processed: existingBackfill?.processed ?? 0,
          total: newTotal,
        }
      );

      return limit !== null && newTotal >= limit;
    });

    const hasMoreArchived = archivedResult.hasMore;

    if (!hasMoreArchived || budgetExhausted) {
      // This channel is done discovering — decrement channelsDiscovering
      await withBackfillLock(integrationId, async () => {
        const integration = await fetchClient.query.integration.byId({
          id: integrationId,
        });
        const settings = safeParseIntegrationSettings(
          integration?.configStr ?? null
        );
        const backfill = settings?.backfill;
        if (backfill) {
          const newChannelsDiscovering = Math.max(
            0,
            backfill.channelsDiscovering - 1
          );
          // Check if backfill is complete (no more discovery and all processed)
          if (
            newChannelsDiscovering === 0 &&
            backfill.processed >= backfill.total
          ) {
            await updateBackfillStatus(
              integrationId,
              integration?.configStr ?? null,
              null
            );
          } else {
            await updateBackfillStatus(
              integrationId,
              integration?.configStr ?? null,
              {
                ...backfill,
                channelsDiscovering: newChannelsDiscovering,
              }
            );
          }
        }
      });

      return { hasMore: false };
    }

    // Find the oldest archived thread's archiveTimestamp for the next page cursor
    const archivedThreads = [...archivedResult.threads.values()];
    const oldestThread = archivedThreads.at(-1);
    const nextCursor = oldestThread?.archiveTimestamp
      ? new Date(oldestThread.archiveTimestamp).toISOString()
      : undefined;

    return { hasMore: true, nextCursor };
  } catch (error) {
    console.error(`    Error fetching threads from #${channel.name}:`, error);
    // Decrement channelsDiscovering on error so backfill can complete
    await withBackfillLock(integrationId, async () => {
      const integration = await fetchClient.query.integration.byId({
        id: integrationId,
      });
      const settings = safeParseIntegrationSettings(
        integration?.configStr ?? null
      );
      const backfill = settings?.backfill;
      if (backfill) {
        const newChannelsDiscovering = Math.max(
          0,
          backfill.channelsDiscovering - 1
        );
        if (
          newChannelsDiscovering === 0 &&
          backfill.processed >= backfill.total
        ) {
          await updateBackfillStatus(
            integrationId,
            integration?.configStr ?? null,
            null
          );
        } else {
          await updateBackfillStatus(
            integrationId,
            integration?.configStr ?? null,
            {
              ...backfill,
              channelsDiscovering: newChannelsDiscovering,
            }
          );
        }
      }
    });
    return { hasMore: false };
  }
};

/**
 * Handle Discord integration changes - triggers backfill when channels are added
 * Uses persisted syncedChannels instead of in-memory Map
 */
const handleIntegrationChanges = async (
  integrations: {
    id: string;
    organizationId: string;
    configStr: string | null;
  }[]
) => {
  for (const integration of integrations) {
    try {
      const settings = safeParseIntegrationSettings(integration.configStr);
      if (!settings?.guildId) {
        continue;
      }

      const { guildId } = settings;
      const currentChannels = new Set(settings.selectedChannels ?? []);
      let syncedChannels = new Set(settings.syncedChannels ?? []);

      // Migration: if syncedChannels is undefined, initialize from current selectedChannels
      // This prevents false trigger on first deploy with new code
      if (settings.syncedChannels === undefined) {
        await updateSyncedChannels(integration.id, [...currentChannels]);
        continue;
      }

      // Cleanup: remove channels from syncedChannels that are no longer in selectedChannels
      // This ensures re-adding a channel later triggers a fresh backfill
      const cleanedSynced = [...syncedChannels].filter((ch) =>
        currentChannels.has(ch)
      );
      const hadCleanup = cleanedSynced.length !== syncedChannels.size;
      if (hadCleanup) {
        syncedChannels = new Set(cleanedSynced);
      }

      // Find newly added channels (in selected but not in synced)
      const addedChannels = [...currentChannels].filter(
        (ch) => !syncedChannels.has(ch)
      );

      if (addedChannels.length === 0) {
        // Persist cleanup only (no new channels to add)
        if (hadCleanup) {
          await updateSyncedChannels(integration.id, [...syncedChannels]);
        }
        continue;
      }

      // Consolidate cleanup + add into a single update
      const finalSynced = [...syncedChannels, ...addedChannels];

      // Check if backfill feature is enabled for this organization
      const { isEnabled: isBackfillEnabled } = reflagClient
        .bindClient({ company: { id: integration.organizationId } })
        .getFlag("backfill-threads");
      if (!isBackfillEnabled) {
        console.log(
          `[Discord] Backfill disabled via feature flag, skipping ${addedChannels.length} channel(s)`
        );
        // Still mark as synced so we don't re-check on restart
        await updateSyncedChannels(integration.id, finalSynced);
        continue;
      }

      console.log(
        `Detected ${addedChannels.length} new channel(s) for integration ${integration.id}: ${addedChannels.join(", ")}`
      );

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.log(`Guild ${guildId} not found in cache, skipping`);
        continue;
      }

      // Query plan limit
      const limit = await getBackfillLimit(integration.organizationId);

      // Add new channels to syncedChannels immediately (at backfill START)
      // BullMQ handles retries for in-progress jobs
      await updateSyncedChannels(integration.id, finalSynced);

      // Initialize/accumulate backfill status
      await withBackfillLock(integration.id, async () => {
        const latestIntegration = await fetchClient.query.integration.byId({
          id: integration.id,
        });
        const latestSettings = safeParseIntegrationSettings(
          latestIntegration?.configStr ?? null
        );
        const existingBackfill = latestSettings?.backfill;

        const channelsToQueue: {
          channel: TextChannel | ForumChannel;
          name: string;
        }[] = [];
        for (const channelName of addedChannels) {
          const channel = guild.channels.cache.find(
            (c): c is TextChannel | ForumChannel =>
              (c.type === ChannelType.GuildText ||
                c.type === ChannelType.GuildForum) &&
              c.name === channelName
          );
          if (channel) {
            channelsToQueue.push({ channel, name: channelName });
          } else {
            console.log(`    Channel #${channelName} not found in guild`);
          }
        }

        if (channelsToQueue.length === 0) {
          return;
        }

        await updateBackfillStatus(
          integration.id,
          latestIntegration?.configStr ?? null,
          {
            channelsDiscovering:
              (existingBackfill?.channelsDiscovering ?? 0) +
              channelsToQueue.length,
            limit: existingBackfill?.limit ?? limit,
            processed: existingBackfill?.processed ?? 0,
            total: existingBackfill?.total ?? 0,
          }
        );

        // Queue first backfill-channel job (no cursor) for each new channel
        for (const { channel } of channelsToQueue) {
          await addChannelBackfillJob(
            channel,
            guildId,
            integration.organizationId,
            integration.id
          );
        }
      });
    } catch (error) {
      console.error(`Error processing integration ${integration.id}:`, error);
    }
  }
};

/**
 * Backfill a single thread and its messages through `mutate.ingest`. The ingest
 * procedure is idempotent (create-vs-append + `externalMessageId` dedup owned by
 * the core), so this one path covers both a first-time thread and a re-added
 * channel — no connector-side `byExternalId` checks. Status (Discord archived →
 * FrontDesk Closed) stays a separate generic `thread.setStatus` mutation.
 */
const backfillThread = async (
  thread: ThreadChannel,
  organizationId: string
) => {
  // Fetch all messages with pagination
  const allMessages: Message[] = [];
  let lastMessageId: string | undefined;
  let hasMoreMessages = true;
  while (hasMoreMessages) {
    const batch = await thread.messages.fetch({
      limit: 100,
      ...(lastMessageId ? { before: lastMessageId } : {}),
    });
    if (batch.size === 0) {
      hasMoreMessages = false;
    } else {
      allMessages.push(...batch.values());
      lastMessageId = batch.last()?.id;
    }
  }
  const sortedMessages = allMessages
    .filter((m) => !m.author.bot)
    .toSorted((a, b) => a.createdTimestamp - b.createdTimestamp);

  if (sortedMessages.length === 0) {
    console.log(`      Skipping thread with no messages: ${thread.name}`);
    return;
  }

  // Ingest in chronological order: the first call creates the thread (with the
  // first non-bot message as its root author), the rest append. The core dedups
  // any already-ingested message, so re-added channels only add what's missing.
  let frontdeskThreadId: string | null = null;
  let currentStatus = 0;
  for (const message of sortedMessages) {
    const { thread: fdThread } = await ingestDiscordMessage({
      externalThreadId: thread.id,
      isBackfill: true,
      message,
      organizationId,
      title: thread.name,
    });
    if (fdThread) {
      frontdeskThreadId = fdThread.id;
      currentStatus = fdThread.status;
    }
  }

  // Sync status only between Open (0) and Closed (3); preserve In Progress (1)
  // and Resolved (2). `currentStatus` reflects the thread's state before this
  // backfill's inserts (0 for a freshly created thread).
  const expectedStatus = thread.archived ? 3 : 0;
  if (
    frontdeskThreadId &&
    ((currentStatus === 0 && expectedStatus === 3) ||
      (currentStatus === 3 && expectedStatus === 0))
  ) {
    await fetchClient.mutate.thread.setStatus({
      organizationId,
      source: "discord",
      status: expectedStatus,
      threadId: frontdeskThreadId,
    });
  }

  console.log(`      Synced ${sortedMessages.length} messages`);
};

client.on("messageCreate", async (message) => {
  if (!message.channel.isThread() || message.author.bot || !message.guild?.id) {
    return;
  }

  const integration = (
    await fetchClient.query.integration.listByType({ type: "discord" })
  ).find((i) => {
    const parsed = safeParseIntegrationSettings(i.configStr);
    return parsed?.guildId === message.guild?.id;
  });

  if (!integration) {
    return;
  }

  const integrationSettings = safeParseIntegrationSettings(
    integration.configStr
  );

  if (
    !(integrationSettings?.selectedChannels ?? [])?.includes(
      message.channel.parent?.name ?? ""
    )
  ) {
    return;
  }

  // One idempotent ingest call: the core creates the thread on the first message
  // for this channel and appends thereafter (no timing heuristic, no dedup here).
  const { thread, created } = await ingestDiscordMessage({
    externalThreadId: message.channel.id,
    message,
    organizationId: integration.organizationId,
    title: message.channel.name,
  });

  if (!thread) {
    return;
  }
  const threadId = thread.id;

  // The portal-link embed is posted once, when the thread is first created.
  let portalMessageOrgSlug: string | null = null;
  if (created) {
    try {
      const organization = await fetchClient.query.organization.byId({
        id: integration.organizationId,
      });

      if (organization?.slug) {
        const showPortalMessage =
          integrationSettings?.showPortalMessage !== false;

        if (showPortalMessage) {
          portalMessageOrgSlug = organization.slug;
        } else {
          console.log("Skipping sending portal link message");
        }
      }
    } catch (error) {
      console.error("Error sending portal link message:", error);
    }
  }

  if (portalMessageOrgSlug) {
    const baseUrl = process.env.BASE_URL ?? "https://tryfrontdesk.app";
    const portalUrl = buildPortalThreadUrl(
      baseUrl,
      portalMessageOrgSlug,
      threadId
    );
    const portalEmbed = buildPortalBotEmbed({
      portalUrl,
      relatedThreadLinks: [],
    });

    try {
      const botMessage = await message.channel.send({
        embeds: [portalEmbed],
      });

      void (async () => {
        try {
          await sleep(RELATED_THREADS_INITIAL_DELAY_MS);

          const relatedThreadLinks = await getRelatedThreadLinks({
            baseUrl,
            organizationId: integration.organizationId,
            organizationSlug: portalMessageOrgSlug,
            threadId,
          });

          if (relatedThreadLinks.length === 0) {
            return;
          }

          const updatedEmbed = buildPortalBotEmbed({
            portalUrl,
            relatedThreadLinks,
          });

          await botMessage.edit({
            embeds: [updatedEmbed],
          });
        } catch (error) {
          console.error("Error updating portal link message:", error);
        }
      })();
    } catch (error) {
      console.error("Error sending portal link message:", error);
    }
  }
});

/**
 * Resolve the Discord channel a normalized thread maps to, or `null` if this
 * connector can't currently deliver to it (no matching guild in cache, etc.).
 * The channel id lives on `thread.externalId`, guarded by `externalOrigin`.
 */
const resolveDiscordChannel = async (thread: {
  organizationId?: string;
  externalOrigin?: string | null;
  externalId?: string | null;
}) => {
  const organizationId = thread?.organizationId;
  if (!organizationId) {
    return null;
  }

  const integration = await fetchClient.query.integration.forOrg({
    organizationId,
    type: "discord",
  });
  if (!integration || !integration.configStr) {
    return null;
  }

  const parsedConfig = safeParseIntegrationSettings(integration.configStr);
  const guildId = parsedConfig?.guildId;
  if (!guildId) {
    return null;
  }

  const channelId =
    thread.externalOrigin === "discord" ? thread.externalId : null;
  if (!channelId) {
    return null;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return null;
  }

  return guild.channels.cache.get(channelId) ?? null;
};

/**
 * Deliver one outbound reply to Discord via the channel webhook. Returns the
 * webhook message id to round-trip, or `null` to leave it for the next pass.
 */
const deliverDiscordMessage = async (
  message: OutboundMessage
): Promise<string | null> => {
  const channel = await resolveDiscordChannel(message.thread);
  if (!channel) {
    return null;
  }

  try {
    const webhookClient = await getOrCreateWebhook(channel as TextChannel);
    const webhookMessage = await webhookClient.send({
      avatarURL: message.author?.user?.image ?? undefined,
      content: stringify(safeParseJSON(message.content), {
        heading: true,
        horizontalRule: true,
      }),
      threadId: channel.id,
      username: message.author.name,
    });
    return webhookMessage.id;
  } catch (error) {
    console.error("Error sending webhook message:", error);
    return null;
  }
};

interface UpdateMetadata {
  userName?: string;
  newStatusLabel?: string;
  newPriorityLabel?: string;
  newAssignedUserName?: string;
}

const formatUpdateMessage = (update: OutboundUpdate): string => {
  let metadata: UpdateMetadata | null = null;
  if (update.metadataStr) {
    try {
      metadata = JSON.parse(update.metadataStr);
    } catch (error) {
      console.error("Error parsing update metadata:", error);
    }
  }
  const userName = update.user?.name ?? metadata?.userName ?? "Someone";

  if (update.type === "status_changed") {
    return `**${userName}** changed status to **${
      metadata?.newStatusLabel ?? "unknown"
    }**`;
  }

  if (update.type === "priority_changed") {
    return `**${userName}** changed priority to **${
      metadata?.newPriorityLabel ?? "unknown"
    }**`;
  }

  if (update.type === "assigned_changed") {
    if (!metadata?.newAssignedUserName) {
      return `**${userName}** unassigned the thread`;
    }
    return `**${userName}** assigned the thread to **${metadata.newAssignedUserName}**`;
  }

  return `**${userName}** updated the thread`;
};

/**
 * Deliver one outbound thread update to Discord as a bot message. Returns the
 * message id to round-trip, or `null` to leave it un-replicated. The framework's
 * outbound helper owns the replicated-check and in-flight dedup.
 */
const deliverDiscordUpdate = async (
  update: OutboundUpdate
): Promise<string | null> => {
  const channel = await resolveDiscordChannel(update.thread);
  if (!channel) {
    return null;
  }

  const botMessage = await (channel as TextChannel).send({
    content: formatUpdateMessage(update),
  });
  return botMessage.id;
};

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

// client.once("ready", async () => {
//   if (!client.user) return;
//   console.log(`Logged in as ${client.user.tag}`);

//   // Set up webhooks for all text channels in all guilds
//   for (const [guildId, guild] of client.guilds.cache) {
//     try {
//       console.log(`Setting up webhooks for server: ${guild.name} (${guildId})`);

//       // Get all text channels
//       const channels = guild.channels.cache.filter(
//         (c): c is TextChannel =>
//           c.type === ChannelType.GuildText &&
//           c.viewable &&
//           guild.members.me?.permissionsIn(c).has("ManageWebhooks") === true
//       );

//       // Create webhooks for each channel
//       for (const channel of channels.values()) {
//         try {
//           await getOrCreateWebhook(channel);
//           console.log(`  ✓ Webhook ready for #${channel.name}`);
//         } catch (error) {
//           console.error(
//             `  ✗ Failed to set up webhook for #${channel.name}:`,
//             error
//           );
//         }
//       }
//     } catch (error) {
//       console.error(`Error setting up webhooks for guild ${guildId}:`, error);
//     }
//   }
// });

client.once("ready", async () => {
  if (!client.user) {
    return;
  }
  console.log(`Logged in as ${client.user.tag}`);

  // Initialize Reflag client for feature flags
  await reflagClient.initialize();
  console.log("[Discord] Reflag initialized");

  // Initialize the backfill worker with handlers
  initializeBackfillWorker(client, {
    onThreadBackfillComplete: async (integrationId: string) => {
      await withBackfillLock(integrationId, async () => {
        const integration = await fetchClient.query.integration.byId({
          id: integrationId,
        });
        const settings = safeParseIntegrationSettings(
          integration?.configStr ?? null
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
            null
          );
        } else {
          await updateBackfillStatus(
            integrationId,
            integration?.configStr ?? null,
            {
              ...backfill,
              processed: currentProcessed,
            }
          );
        }
      });
    },
    processChannel: backfillChannel,
    processThread: backfillThread,
  });
});

setTimeout(async () => {
  // Watch un-replicated outbound messages/updates for Discord threads and
  // deliver them; the framework owns the round-trip of external message ids.
  await startOutboundReplication({
    deliverMessage: deliverDiscordMessage,
    deliverUpdate: deliverDiscordUpdate,
    fetchClient,
    provider: DISCORD_PROVIDER,
    store,
  });

  // Subscribe to Discord integrations to trigger backfill when channels are added
  store.query.integration
    .where({ type: "discord" })
    .subscribe(handleIntegrationChanges);
}, 1000);

client.login(token).catch(console.error);

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down...");
  await reflagClient.flush();
  await closeBackfillQueue();
  client.destroy();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
