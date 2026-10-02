import type { ThreadImportJobData } from "@connectors/framework";
import {
  startOutboundReplication,
  startThreadImportWorker,
} from "@connectors/framework/runtime";
import type {
  OutboundMessage,
  OutboundUpdate,
  ThreadImportCandidate,
  ThreadImportPayload,
  ThreadImportSource,
  Worker,
} from "@connectors/framework/runtime";
import { parse } from "@workspace/utils/md-tiptap";
import { stringify } from "@workspace/utils/tiptap-md";
import {
  ChannelType,
  Client,
  DiscordAPIError,
  GatewayIntentBits,
} from "discord.js";
import type {
  ForumChannel,
  Message,
  TextChannel,
  ThreadChannel,
} from "discord.js";

import "./env";
import { fetchClient, store } from "./lib/live-state";
import {
  parseContentAsMarkdown,
  safeParseIntegrationSettings,
  safeParseJSON,
} from "./lib/utils";
import { getOrCreateWebhook } from "./utils";

/** Integration `type` / `support-entry-point` provider key for this connector. */
const DISCORD_PROVIDER = "discord";

const ensureThreadTitle = (title: string) =>
  title.length >= 3 ? title : title.padEnd(3, ".");

const token = process.env.DISCORD_TOKEN;

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
}) =>
  fetchClient.mutate.ingest.ingest({
    author: {
      externalId: args.message.author.id,
      name: args.message.author.displayName,
    },
    externalThreadId: args.externalThreadId,
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

type ImportableChannel = TextChannel | ForumChannel;

/** Discord "Missing Access" / "Missing Permissions" API errors. */
const isMissingAccess = (error: unknown) =>
  error instanceof DiscordAPIError &&
  (error.code === 50_001 || error.code === 50_013);

/**
 * "Import threads" source for one Discord integration. Threads under a
 * selected channel are support threads, and bot messages are dropped, exactly
 * as `messageCreate` does live.
 */
const createDiscordImportSource = (
  channels: ImportableChannel[]
): ThreadImportSource => {
  const threads = new Map<string, ThreadChannel>();

  const toCandidates = (page: Iterable<ThreadChannel>) =>
    [...page]
      .map((thread) => {
        threads.set(thread.id, thread);
        return {
          externalThreadId: thread.id,
          startedAt: thread.createdTimestamp ?? 0,
        };
      })
      .toSorted((a, b) => b.startedAt - a.startedAt);

  // Discord pages archived threads by archive time, not creation time, so
  // "newest first" is approximate here: an old thread archived recently can
  // come before a newer one archived earlier.
  async function* listChannelThreads(channel: ImportableChannel) {
    const active = await channel.threads.fetchActive();
    yield toCandidates(active.threads.values());

    yield* listArchived(channel, "public");
    // Live ingestion also accepts private threads under a selected channel.
    // Listing their archive needs Manage Threads; without it, skip them.
    if (channel.type === ChannelType.GuildText) {
      try {
        yield* listArchived(channel, "private");
      } catch (error) {
        if (!isMissingAccess(error)) {
          throw error;
        }
      }
    }
  }

  async function* listArchived(
    channel: ImportableChannel,
    type: "public" | "private"
  ) {
    let before: Date | undefined;
    while (true) {
      const archived = await channel.threads.fetchArchived({
        limit: 100,
        type,
        ...(before ? { before } : {}),
      });
      const page = [...archived.threads.values()];
      yield toCandidates(page);
      const oldest = page.at(-1)?.archiveTimestamp;
      if (!archived.hasMore || !oldest) {
        return;
      }
      before = new Date(oldest);
    }
  }

  const load = async (
    candidate: ThreadImportCandidate
  ): Promise<ThreadImportPayload | null> => {
    const thread = threads.get(candidate.externalThreadId);
    if (!thread) {
      return null;
    }

    const fetched: Message[] = [];
    let before: string | undefined;
    while (true) {
      const batch = await thread.messages.fetch({
        limit: 100,
        ...(before ? { before } : {}),
      });
      fetched.push(...batch.values());
      before = batch.last()?.id;
      if (batch.size < 100 || !before) {
        break;
      }
    }

    const messages = fetched
      .filter((message) => !message.author.bot)
      .toSorted((a, b) => a.createdTimestamp - b.createdTimestamp);
    if (messages.length === 0) {
      return null;
    }

    return {
      externalThreadId: thread.id,
      messages: messages.map((message) => ({
        author: {
          externalId: message.author.id,
          name: message.author.displayName,
        },
        body: parse(parseContentAsMarkdown(message)),
        createdAt: message.createdAt,
        externalMessageId: message.id,
      })),
      thread: {
        externalMetadata: { channelId: thread.id },
        title: ensureThreadTitle(thread.name),
      },
    };
  };

  return { channels: channels.map(listChannelThreads), load };
};

const resolveDiscordImportSource = async ({
  integrationId,
  channelIds,
}: ThreadImportJobData): Promise<ThreadImportSource | null> => {
  const integration = await fetchClient.query.integration.byId({
    id: integrationId,
  });
  const settings = safeParseIntegrationSettings(integration?.configStr ?? null);
  if (!integration?.enabled || !settings?.guildId) {
    return null;
  }
  const guild = await client.guilds.fetch(settings.guildId);
  // Re-checked against the current selection: a channel deselected after the
  // run was queued is no longer a support channel.
  const requested = new Set(channelIds);
  const selected = new Set(
    (settings.selectedChannels ?? []).filter((name) => requested.has(name))
  );
  const channels = [...(await guild.channels.fetch()).values()].filter(
    (channel): channel is ImportableChannel =>
      (channel?.type === ChannelType.GuildText ||
        channel?.type === ChannelType.GuildForum) &&
      selected.has(channel.name)
  );
  return createDiscordImportSource(channels);
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
  await ingestDiscordMessage({
    externalThreadId: message.channel.id,
    message,
    organizationId: integration.organizationId,
    title: message.channel.name,
  });
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

let threadImportWorker: Worker<ThreadImportJobData> | undefined;

client.once("ready", async () => {
  if (!client.user) {
    return;
  }
  console.log(`Logged in as ${client.user.tag}`);

  threadImportWorker ??= startThreadImportWorker({
    fetchClient,
    provider: DISCORD_PROVIDER,
    resolveSource: resolveDiscordImportSource,
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
}, 1000);

client.login(token).catch(console.error);

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down...");
  await threadImportWorker?.close();
  client.destroy();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
