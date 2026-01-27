import type { InferLiveObject } from "@live-state/sync";
import { parse } from "@workspace/ui/lib/md-tiptap";
import { stringify } from "@workspace/ui/lib/tiptap-md";
import type { schema } from "api/schema";
import {
  ChannelType,
  Client,
  type ForumChannel,
  GatewayIntentBits,
  type Message,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { ulid } from "ulid";
import "./env";
import { fetchClient, store } from "./lib/live-state";
import {
  parseContentAsMarkdown,
  safeParseIntegrationSettings,
  safeParseJSON,
} from "./lib/utils";
import { getOrCreateWebhook } from "./utils";

const THREAD_CREATION_THRESHOLD_MS = 1000;

const token = process.env.DISCORD_TOKEN;

type RelatedThreadResult = {
  threadId: string;
  score: number;
};

type RelatedThreadLink = {
  threadId: string;
  name: string | null;
  url: string;
};

const parseContentAsMarkdown = (message: Message): string => {
  let content = message.content;

  // Replace user mentions: <@userId> or <@!userId> with @Username
  for (const [userId, user] of message.mentions.users) {
    const mentionPattern = new RegExp(`<@!?${userId}>`, "g");
    content = content.replace(mentionPattern, `@${user.displayName}`);
  }

  // Replace role mentions: <@&roleId> with @RoleName
  for (const [roleId, role] of message.mentions.roles) {
    const mentionPattern = new RegExp(`<@&${roleId}>`, "g");
    content = content.replace(mentionPattern, `@${role.name}`);
  }

  // Replace channel mentions: <#channelId> with #ChannelName
  for (const [channelId, channel] of message.mentions.channels) {
    const mentionPattern = new RegExp(`<#${channelId}>`, "g");
    if ("name" in channel) {
      content = content.replace(mentionPattern, `#${channel.name}`);
    }
  }

  return content;
};

const RELATED_THREADS_SUGGESTION_TYPE = "related_threads";
const RELATED_THREAD_LINK_LIMIT = 5;
const RELATED_THREADS_POLL_ATTEMPTS = 5;
const RELATED_THREADS_INITIAL_DELAY_MS = 30000;
const RELATED_THREADS_BACKOFF_BASE_MS = 1000;
const RELATED_THREADS_BACKOFF_MAX_MULTIPLIER = 5;
const RELATED_THREADS_BACKOFF_MAX_MS =
  RELATED_THREADS_BACKOFF_BASE_MS * RELATED_THREADS_BACKOFF_MAX_MULTIPLIER;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const buildPortalThreadUrl = (
  baseUrl: string,
  organizationSlug: string,
  threadId: string
) => {
  const baseUrlObj = new URL(baseUrl);
  const port = baseUrlObj.port ? `:${baseUrlObj.port}` : "";
  return `${baseUrlObj.protocol}//${organizationSlug}.${baseUrlObj.hostname}${port}/threads/${threadId}`;
};

const parseRelatedThreadResults = (
  resultsStr: string | null | undefined
): RelatedThreadResult[] => {
  if (!resultsStr) return [];
  try {
    const parsed = JSON.parse(resultsStr);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.threadId === "string")
      .map((item) => ({
        threadId: item.threadId as string,
        score: typeof item.score === "number" ? item.score : 0,
      }));
  } catch {
    return [];
  }
};

const getRelatedThreadLinks = async ({
  organizationId,
  organizationSlug,
  threadId,
  baseUrl,
}: {
  organizationId: string;
  organizationSlug: string;
  threadId: string;
  baseUrl: string;
}): Promise<RelatedThreadLink[]> => {
  const seenThreadIds = new Set<string>();
  const links: RelatedThreadLink[] = [];
  let backoffMs = RELATED_THREADS_BACKOFF_BASE_MS;

  for (let attempt = 0; attempt < RELATED_THREADS_POLL_ATTEMPTS; attempt += 1) {
    const suggestion = await fetchClient.query.suggestion
      .first({
        type: RELATED_THREADS_SUGGESTION_TYPE,
        entityId: threadId,
        organizationId,
        active: true,
      })
      .get();

    const results = parseRelatedThreadResults(suggestion?.resultsStr).filter(
      (result) => result.threadId !== threadId
    );

    if (results.length > 0) {
      for (const result of results) {
        if (seenThreadIds.has(result.threadId)) continue;
        if (links.length >= RELATED_THREAD_LINK_LIMIT) break;

        const thread = store.query.thread.first({ id: result.threadId }).get();

        if (thread?.deletedAt) continue;

        seenThreadIds.add(result.threadId);
        links.push({
          threadId: result.threadId,
          name: thread?.name ?? null,
          url: buildPortalThreadUrl(baseUrl, organizationSlug, result.threadId),
        });
      }

      if (links.length > 0) {
        return links;
      }
    }

    if (attempt < RELATED_THREADS_POLL_ATTEMPTS - 1) {
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, RELATED_THREADS_BACKOFF_MAX_MS);
    }
  }

  return links;
};

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
    lines.push("");
    lines.push("Related threads:");
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
 * Helper to get or create an author record for a Discord user
 */
const getOrCreateAuthor = async (
  discordUserId: string,
  displayName: string,
  organizationId: string,
): Promise<string> => {
  let authorId = store.query.author
    .first({ metaId: `discord:${discordUserId}` })
    .get()?.id;

  if (!authorId) {
    authorId = ulid().toLowerCase();
    await fetchClient.mutate.author.insert({
      id: authorId,
      name: displayName,
      userId: null,
      metaId: `discord:${discordUserId}`,
      organizationId,
    });
  }

  return authorId;
};

// Track which channels have been configured per integration to detect additions
const integrationChannels = new Map<string, Set<string>>();

/**
 * Backfill threads from a specific Discord channel
 */
const backfillChannel = async (
  channel: TextChannel | ForumChannel,
  organizationId: string,
) => {
  console.log(`  Fetching threads from #${channel.name}...`);

  try {
    // Fetch active threads
    const activeThreads = await channel.threads.fetchActive();
    // Fetch archived threads (fetches up to 100 by default)
    const archivedThreads = await channel.threads.fetchArchived();

    const allThreads = [
      ...activeThreads.threads.values(),
      ...archivedThreads.threads.values(),
    ];

    console.log(`    Found ${allThreads.length} threads`);

    for (const thread of allThreads) {
      await backfillThread(thread, organizationId);
    }
  } catch (error) {
    console.error(`    Error fetching threads from #${channel.name}:`, error);
  }
};

/**
 * Handle Discord integration changes - triggers backfill when channels are added
 */
const handleIntegrationChanges = async (
  integrations: {
    id: string;
    organizationId: string;
    configStr: string | null;
  }[],
) => {
  for (const integration of integrations) {
    try {
      const settings = safeParseIntegrationSettings(integration.configStr);
      if (!settings?.guildId) continue;

      const currentChannels = new Set(settings.selectedChannels ?? []);
      const previousChannels =
        integrationChannels.get(integration.id) ?? new Set();

      // Find newly added channels
      const addedChannels = [...currentChannels].filter(
        (ch) => !previousChannels.has(ch),
      );

      // Update tracked channels
      integrationChannels.set(integration.id, currentChannels);

      if (addedChannels.length === 0) continue;

      console.log(
        `Detected ${addedChannels.length} new channel(s) for integration ${integration.id}: ${addedChannels.join(", ")}`,
      );

      const guild = client.guilds.cache.get(settings.guildId);
      if (!guild) {
        console.log(`Guild ${settings.guildId} not found in cache, skipping`);
        continue;
      }

      // Find and backfill the newly added channels
      for (const channelName of addedChannels) {
        const channel = guild.channels.cache.find(
          (c): c is TextChannel | ForumChannel =>
            (c.type === ChannelType.GuildText ||
              c.type === ChannelType.GuildForum) &&
            c.name === channelName,
        );

        if (channel) {
          await backfillChannel(channel, integration.organizationId);
        } else {
          console.log(`    Channel #${channelName} not found in guild`);
        }
      }
    } catch (error) {
      console.error(
        `Error processing integration ${integration.id}:`,
        error,
      );
    }
  }
};

/**
 * Backfill a single thread and its messages
 */
const backfillThread = async (
  thread: ThreadChannel,
  organizationId: string,
) => {
  // Check if thread already exists in the database using externalId
  const existingThread = await fetchClient.query.thread
    .first({ externalId: thread.id })
    .get();

  if (existingThread) {
    // Thread exists (re-added channel), backfill only missing messages
    await backfillMessages(thread, existingThread.id, organizationId);
    return;
  }

  console.log(`      Creating thread: ${thread.name}`);

  // Fetch messages to find the original author
  const messages = await thread.messages.fetch({ limit: 100 });
  const sortedMessages = [...messages.values()].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp,
  );

  if (sortedMessages.length === 0) {
    console.log(`      Skipping thread with no messages: ${thread.name}`);
    return;
  }

  // Get the first non-bot message author as the thread author
  const firstMessage =
    sortedMessages.find((m) => !m.author.bot) ?? sortedMessages[0];
  const authorId = await getOrCreateAuthor(
    firstMessage.author.id,
    firstMessage.author.displayName,
    organizationId,
  );

  // Create the thread
  const threadId = ulid().toLowerCase();
  store.mutate.thread.insert({
    id: threadId,
    organizationId,
    name: thread.name,
    createdAt: thread.createdAt ?? new Date(),
    deletedAt: null,
    discordChannelId: thread.id,
    authorId,
    assignedUserId: null,
    externalIssueId: null,
    externalPrId: null,
    externalId: thread.id,
    externalOrigin: "discord",
    externalMetadataStr: JSON.stringify({ channelId: thread.id }),
  });

  // Wait for the thread to be created
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Optionally send portal message for new threads
  // (Skipped during backfill to avoid spamming old threads)

  // Sync all messages
  for (const message of sortedMessages) {
    if (message.author.bot) continue;

    await backfillMessage(message, threadId, organizationId);
  }

  console.log(
    `      Synced ${sortedMessages.filter((m) => !m.author.bot).length} messages`,
  );
};

/**
 * Backfill messages for an existing thread (check for missing messages)
 * Used when a channel is re-added to an integration
 */
const backfillMessages = async (
  thread: ThreadChannel,
  threadId: string,
  organizationId: string,
) => {
  const messages = await thread.messages.fetch({ limit: 100 });
  const sortedMessages = [...messages.values()].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp,
  );

  let syncedCount = 0;
  for (const message of sortedMessages) {
    if (message.author.bot) continue;

    // Check if message already exists in the database
    const existingMessage = await fetchClient.query.message
      .first({ externalMessageId: message.id })
      .get();

    if (!existingMessage) {
      await backfillMessage(message, threadId, organizationId);
      syncedCount++;
    }
  }

  if (syncedCount > 0) {
    console.log(
      `      Synced ${syncedCount} missing messages for thread: ${thread.name}`,
    );
  }
};

/**
 * Backfill a single message
 */
const backfillMessage = async (
  message: Message,
  threadId: string,
  organizationId: string,
) => {
  const authorId = await getOrCreateAuthor(
    message.author.id,
    message.author.displayName,
    organizationId,
  );

  const contentWithMentions = parseContentAsMarkdown(message);

  store.mutate.message.insert({
    id: ulid().toLowerCase(),
    threadId,
    authorId,
    content: JSON.stringify(parse(contentWithMentions)),
    createdAt: message.createdAt,
    origin: "discord",
    externalMessageId: message.id,
  });
};

const THREAD_CREATION_THRESHOLD_MS = 1000;

client.on("messageCreate", async (message) => {
  if (!message.channel.isThread() || message.author.bot || !message.guild?.id)
    return;

  const isFirstMessage =
    Math.abs(
      (message.channel.createdTimestamp ?? 0) - (message.createdTimestamp ?? 0),
    ) < THREAD_CREATION_THRESHOLD_MS;

  let threadId: string | null = null;
  let portalMessageOrgSlug: string | null = null;

  const integration = (
    await fetchClient.query.integration.where({ type: "discord" }).get()
  ).find((i) => {
    const parsed = safeParseIntegrationSettings(i.configStr);
    return parsed?.guildId === message.guild?.id;
  });

  if (!integration) return;

  const integrationSettings = safeParseIntegrationSettings(
    integration.configStr,
  );

  if (
    !(integrationSettings?.selectedChannels ?? [])?.includes(
      message.channel.parent?.name ?? "",
    )
  )
    return;

  // TODO do this in a transaction

  const authorId = await getOrCreateAuthor(
    message.author.id,
    message.author.displayName,
    integration.organizationId,
  );

  if (isFirstMessage) {
    threadId = ulid().toLowerCase();
    store.mutate.thread.insert({
      id: threadId,
      organizationId: integration.organizationId,
      name: message.channel.name,
      createdAt: new Date(),
      deletedAt: null,
      discordChannelId: message.channel.id,
      authorId: authorId,
      assignedUserId: null,
      externalIssueId: null,
      externalPrId: null,
      externalId: message.channel.id,
      externalOrigin: "discord",
      externalMetadataStr: JSON.stringify({ channelId: message.channel.id }),
    });
    await new Promise((resolve) => setTimeout(resolve, 150)); // TODO remove this once we have a proper transaction

    try {
      const organization = await fetchClient.query.organization
        .first({ id: integration.organizationId })
        .get();

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
  } else {
    const thread = store.query.thread
      .first({
        discordChannelId: message.channel.id,
      })
      .get();

    if (!thread) return;
    threadId = thread.id;
  }

  if (!threadId) return;

  const contentWithMentions = parseContentAsMarkdown(message);

  store.mutate.message.insert({
    id: ulid().toLowerCase(),
    threadId,
    authorId: authorId,
    content: JSON.stringify(parse(contentWithMentions)),
    createdAt: message.createdAt,
    origin: "discord",
    externalMessageId: message.id,
  });

  if (isFirstMessage && portalMessageOrgSlug) {
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
            organizationId: integration.organizationId,
            organizationSlug: portalMessageOrgSlug,
            threadId,
            baseUrl,
          });

          if (relatedThreadLinks.length === 0) return;

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

const handleMessages = async (
  messages: InferLiveObject<
    (typeof schema)["message"],
    { thread: true; author: { user: true } }
  >[],
) => {
  for (const message of messages) {
    // TODO this is not consistent, either we make this part of the include or we wait until the store is bootstrapped. Remove the timeout when this is fixed.
    const integration = await fetchClient.query.integration
      .first({
        organizationId: message.thread?.organizationId,
        type: "discord",
      })
      .get();

    if (!integration || !integration.configStr) continue;

    const parsedConfig = safeParseIntegrationSettings(integration.configStr);

    if (!parsedConfig) continue;

    const guildId = parsedConfig.guildId;

    if (!guildId) continue;

    const channelId = message.thread.discordChannelId;

    if (!channelId) continue;

    const guild = client.guilds.cache.get(guildId);

    if (!guild) continue;

    const channel = guild.channels.cache.get(channelId);

    if (!channel) continue;

    try {
      const webhookClient = await getOrCreateWebhook(channel as TextChannel);
      const webhookMessage = await webhookClient.send({
        content: stringify(safeParseJSON(message.content), {
          heading: true,
          horizontalRule: true,
        }),
        threadId: channel.id,
        username: message.author.name,
        avatarURL: message.author?.user?.image ?? undefined,
      });
      store.mutate.message.update(message.id, {
        externalMessageId: webhookMessage.id,
      });
    } catch (error) {
      console.error("Error sending webhook message:", error);
    }
  }
};

const formatUpdateMessage = (
  update: InferLiveObject<
    (typeof schema)["update"],
    { thread: true; user: true }
  >,
): string => {
  let metadata: any = null;
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

const handlingUpdates = new Set<string>();

const handleUpdates = async (
  updates: InferLiveObject<
    (typeof schema)["update"],
    { thread: true; user: true }
  >[],
) => {
  for (const update of updates) {
    const replicated = update.replicatedStr
      ? JSON.parse(update.replicatedStr)
      : {};
    if (replicated.discord) continue;

    if (handlingUpdates.has(update.id)) continue;

    // TODO this is not consistent, either we make this part of the include or we wait until the store is bootstrapped. Remove the timeout when this is fixed.
    const integration = await fetchClient.query.integration
      .first({
        organizationId: update.thread?.organizationId,
        type: "discord",
      })
      .get();

    if (!integration || !integration.configStr) continue;

    const parsedConfig = safeParseIntegrationSettings(integration.configStr);

    if (!parsedConfig) continue;

    const guildId = parsedConfig.guildId;

    if (!guildId) continue;

    const channelId = update.thread.discordChannelId;

    if (!channelId) continue;

    const guild = client.guilds.cache.get(guildId);

    if (!guild) continue;

    const channel = guild.channels.cache.get(channelId);

    if (!channel) continue;

    handlingUpdates.add(update.id);

    try {
      const updateMessage = formatUpdateMessage(update);
      const botMessage = await (channel as TextChannel).send({
        content: updateMessage,
      });
      await fetchClient.mutate.update.update(update.id, {
        replicatedStr: JSON.stringify({
          ...replicated,
          discord: botMessage.id,
        }),
      });
    } catch (error) {
      console.error("Error sending update bot message:", error);
    } finally {
      handlingUpdates.delete(update.id);
    }
  }
};

client.on("messageCreate", async (message) => {
  if (!message.channel.isThread() || message.author.bot || !message.guild?.id)
    return;

  const isFirstMessage =
    Math.abs(
      (message.channel.createdTimestamp ?? 0) - (message.createdTimestamp ?? 0),
    ) < THREAD_CREATION_THRESHOLD_MS;

  let threadId: string | null = null;

  const integration = (
    await fetchClient.query.integration.where({ type: "discord" }).get()
  ).find((i) => {
    const parsed = safeParseIntegrationSettings(i.configStr);
    return parsed?.guildId === message.guild?.id;
  });

  if (!integration) return;

  const integrationSettings = safeParseIntegrationSettings(
    integration.configStr,
  );

  if (
    !(integrationSettings?.selectedChannels ?? [])?.includes(
      message.channel.parent?.name ?? "",
    )
  )
    return;

  // TODO do this in a transaction

  const authorId = await getOrCreateAuthor(
    message.author.id,
    message.author.displayName,
    integration.organizationId,
  );

  if (isFirstMessage) {
    threadId = ulid().toLowerCase();
    store.mutate.thread.insert({
      id: threadId,
      organizationId: integration.organizationId,
      name: message.channel.name,
      createdAt: new Date(),
      deletedAt: null,
      discordChannelId: message.channel.id,
      authorId: authorId,
      assignedUserId: null,
      externalIssueId: null,
      externalPrId: null,
      externalId: message.channel.id,
      externalOrigin: "discord",
      externalMetadataStr: JSON.stringify({ channelId: message.channel.id }),
    });
    await new Promise((resolve) => setTimeout(resolve, 150)); // TODO remove this once we have a proper transaction

    try {
      const organization = await fetchClient.query.organization
        .first({ id: integration.organizationId })
        .get();

      if (organization?.slug) {
        const showPortalMessage =
          integrationSettings?.showPortalMessage !== false;

        if (showPortalMessage) {
          const baseUrl = process.env.BASE_URL ?? "https://tryfrontdesk.app";
          const baseUrlObj = new URL(baseUrl);
          const port = baseUrlObj.port ? `:${baseUrlObj.port}` : "";
          const portalUrl = `${baseUrlObj.protocol}//${organization.slug}.${baseUrlObj.hostname}${port}/threads/${threadId}`;

          const portalMessage = `This thread is also being tracked in our community portal: ${portalUrl}`;
          await message.channel.send({
            content: portalMessage,
          });
        } else {
          console.log("Skipping sending portal link message");
        }
      }
    } catch (error) {
      console.error("Error sending portal link message:", error);
    }
  } else {
    const thread = store.query.thread
      .first({
        discordChannelId: message.channel.id,
      })
      .get();

    if (!thread) return;
    threadId = thread.id;
  }

  if (!threadId) return;

  const contentWithMentions = parseContentAsMarkdown(message);

  store.mutate.message.insert({
    id: ulid().toLowerCase(),
    threadId,
    authorId: authorId,
    content: JSON.stringify(parse(contentWithMentions)),
    createdAt: message.createdAt,
    origin: "discord",
    externalMessageId: message.id,
  });
});

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
  if (!client.user) return;
  console.log(`Logged in as ${client.user.tag}`);
});

setTimeout(async () => {
  // TODO Subscribe callback is not being triggered with current values - track https://github.com/pedroscosta/live-state/issues/82
  await handleMessages(
    await store.query.message
      .where({
        externalMessageId: null,
        thread: {
          discordChannelId: { $not: null },
        },
      })
      .include({ thread: true, author: { user: true } })
      .get(),
  );
  store.query.message
    .where({
      externalMessageId: null,
      thread: {
        discordChannelId: { $not: null },
      },
    })
    .include({ thread: true, author: { user: true } })
    .subscribe(handleMessages);

  // Handle updates for threads linked to Discord
  const updates = await store.query.update
    .where({
      thread: {
        discordChannelId: { $not: null },
      },
    })
    .include({ thread: true, user: true })
    .get();

  await handleUpdates(updates);
  store.query.update
    .where({
      thread: {
        discordChannelId: { $not: null },
      },
    })
    .include({ thread: true, user: true })
    .subscribe(handleUpdates);

  // Subscribe to Discord integrations to trigger backfill when channels are added
  store.query.integration
    .where({ type: "discord" })
    .subscribe(handleIntegrationChanges);
}, 1000);

client.login(token).catch(console.error);
