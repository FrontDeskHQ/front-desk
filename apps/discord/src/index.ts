import "./env";

import type { InferLiveObject } from "@live-state/sync";
import { parse } from "@workspace/ui/lib/md-tiptap";
import { stringify } from "@workspace/ui/lib/tiptap-md";
import type { schema } from "api/schema";
import type { Message } from "discord.js";
import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { ulid } from "ulid";
import { fetchClient, store } from "./lib/live-state";
import { safeParseIntegrationSettings } from "./lib/utils";
import { getOrCreateWebhook } from "./utils";

const safeParseJSON = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    // Accept common shapes produced by our editor:
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      // e.g. a full doc { type: 'doc', content: [...] }
      // Normalize to content[] to match our usage.
      return (parsed as any).content ?? [];
    }
  } catch {}
  // Fallback: wrap plain text in a single paragraph node.
  return [
    {
      type: "paragraph",
      content: [{ type: "text", text: String(raw) }],
    },
  ];
};

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

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("DISCORD_TOKEN is not defined in environment variables");
  process.exit(1);
}

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

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

const THREAD_CREATION_THRESHOLD_MS = 1000;

client.on("messageCreate", async (message) => {
  if (!message.channel.isThread() || message.author.bot || !message.guild?.id)
    return;

  const isFirstMessage =
    Math.abs(
      (message.channel.createdTimestamp ?? 0) - (message.createdTimestamp ?? 0)
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
    integration.configStr
  );

  if (
    !(integrationSettings?.selectedChannels ?? [])?.includes(
      message.channel.parent?.name ?? ""
    )
  )
    return;

  // TODO do this in a transaction

  let authorId = store.query.author
    .first({ metaId: `discord:${message.author.id}` })
    .get()?.id;

  if (!authorId) {
    authorId = ulid().toLowerCase();
    await fetchClient.mutate.author.insert({
      id: authorId,
      name: message.author.displayName,
      userId: null,
      metaId: `discord:${message.author.id}`,
      organizationId: integration.organizationId,
    });
  }

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
  >[]
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
  >
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
  >[]
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
      .get()
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
}, 1000);

client.login(token).catch(console.error);
