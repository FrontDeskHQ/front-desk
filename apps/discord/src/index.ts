import "./env";

import { parse } from "@workspace/ui/lib/md-tiptap";
import { stringify } from "@workspace/ui/lib/tiptap-md";
import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { ulid } from "ulid";
import { fetchClient, store } from "./lib/live-state";
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
  if (!message.channel.isThread() || message.author.bot) return;

  const isFirstMessage =
    Math.abs(
      (message.channel.createdTimestamp ?? 0) - (message.createdTimestamp ?? 0)
    ) < THREAD_CREATION_THRESHOLD_MS;

  let threadId: string | null = null;

  // FIXME do this in a transaction

  let authorId = store.query.author
    .first({ metaId: message.author.id })
    .get()?.id;

  if (!authorId) {
    authorId = ulid().toLowerCase();
    await fetchClient.mutate.author.insert({
      id: authorId,
      name: message.author.username,
      userId: null,
      metaId: message.author.id,
    });
  }

  if (isFirstMessage) {
    threadId = ulid().toLowerCase();
    store.mutate.thread.insert({
      id: threadId,
      // TODO: get organization ID from integration settings
      organizationId: "01k70mhsbfya10kdez683rq8yk",
      name: message.channel.name,
      createdAt: new Date(),
      discordChannelId: message.channel.id,
      authorId: authorId,
      assignedUserId: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 150)); // FIXME remove this once we have a proper transaction
  } else {
    const thread = store.query.thread
      .where({
        discordChannelId: message.channel.id,
      })
      .get()?.[0];

    if (!thread) return;
    threadId = thread.id;
  }

  console.info("Thread ID:", threadId);
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
  console.info("Message inserted:", message);
});

store.query.message
  .where({
    externalMessageId: null,
    thread: {
      discordChannelId: { $not: null },
    },
  })
  .include({ thread: true, author: true })
  .subscribe(async (messages) => {
    // // TODO: migrate this when live state supports select null and not null
    // const messages = Object.values(v).filter(
    //   (m) => m.thread?.discordChannelId && !m.externalMessageId
    // );

    console.info("Messages to send:", messages);

    for (const message of messages) {
      const channelId = message.thread.discordChannelId;

      console.info("Channel ID:", channelId);

      if (!channelId) continue;

      const channel = client.guilds.cache
        .values()
        .next()
        ?.value?.channels.cache.get(channelId);
      console.info("Channel:", channel);
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
          // avatarURL: message.author.displayAvatarURL(),
        });
        store.mutate.message.update(message.id, {
          externalMessageId: webhookMessage.id,
        });
      } catch (error) {
        console.error("Error sending webhook message:", error);
      }
    }
  });

client.login(token).catch(console.error);
