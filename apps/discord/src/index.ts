import "./env";

import type { InferLiveObject } from "@live-state/sync";
import { parse } from "@workspace/ui/lib/md-tiptap";
import { stringify } from "@workspace/ui/lib/tiptap-md";
import type { schema } from "api/schema";
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

  const integration = store.query.integration
    .where({ type: "discord" })
    .get()
    .find((i) => {
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
      name: message.author.username,
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
      externalId: message.channel.id,
      externalOrigin: "discord",
      externalMetadataStr: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 150)); // TODO remove this once we have a proper transaction

    try {
      const organization = await fetchClient.query.organization
        .first({ id: integration.organizationId })
        .get();

      if (organization?.slug) {
        const baseUrl = process.env.BASE_URL ?? "https://tryfrontdesk.app";
        const baseUrlObj = new URL(baseUrl);
        const port = baseUrlObj.port ? `:${baseUrlObj.port}` : "";
        const portalUrl = `${baseUrlObj.protocol}//${organization.slug}.${baseUrlObj.hostname}${port}/threads/${threadId}`;

        const portalMessage = `This thread is also being tracked in our community portal: ${portalUrl}`;
        await message.channel.send({
          content: portalMessage,
        });
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

  store.mutate.message.insert({
    id: ulid().toLowerCase(),
    threadId,
    authorId: authorId,
    content: JSON.stringify(parse(message.content)),
    createdAt: message.createdAt,
    origin: "discord",
    externalMessageId: message.id,
  });
});

const handleMessages = async (
  messages: InferLiveObject<
    (typeof schema)["message"],
    { thread: true; author: { user: true } }
  >[]
) => {
  for (const message of messages) {
    // TODO this is not consistent, either we make this part of the include or we wait until the store is bootstrapped. Remove the timeout when this is fixed.
    const integration = store.query.integration
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
    const integration = store.query.integration
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
