import "./env";

import type { InferLiveObject } from "@live-state/sync";
import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { App } from "@slack/bolt";
import { parse } from "@workspace/ui/lib/md-tiptap";
import { stringify } from "@workspace/ui/lib/tiptap-md";
import type { schema } from "api/schema";
import { ulid } from "ulid";
import { fetchClient, store } from "./lib/live-state";
import { safeParseIntegrationSettings } from "./lib/utils";

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

const safeParseJSON = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    // Accept common shapes produced by our editor:
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      // e.g. a full doc { type: 'doc', content: [...] }
      // Normalize to content[] to match our usage.
      return (parsed as { content?: unknown }).content ?? [];
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

app.message(
  async ({
    message,
    ack,
    say,
    client,
  }: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs) => {
    // Slack SDK is VERY BAD
    if (ack && typeof ack === "function") await (ack as () => Promise<void>)();

    console.log(JSON.stringify(message, null, 2));

    // Type guard: only process messages with user property
    if (!("user" in message) || !message.user) return;

    // Skip bot messages
    if (message.subtype === "bot_message") return;

    const isFirstMessage = !("thread_ts" in message);

    let threadId: string | null = null;

    // Get conversation info to check channel name
    const conversation = await client.conversations.info({
      channel: message.channel,
    });

    if (!conversation.ok || !conversation.channel) return;

    console.log("conversation", JSON.stringify(conversation, null, 2));

    const channelName = conversation.channel.name;
    if (!channelName) return;

    console.log("channelName", channelName);

    // Find integration for this team
    const teamId = conversation.channel.context_team_id;
    const integration = store.query.integration
      .where({ type: "slack" })
      .get()
      .find((i) => {
        const parsed = safeParseIntegrationSettings(i.configStr);
        return parsed?.teamId === teamId;
      });

    console.log(
      "all integrations",
      JSON.stringify(
        store.query.integration.where({ type: "slack" }).get(),
        null,
        2
      )
    );

    if (!integration) return;

    console.log("integration", JSON.stringify(integration, null, 2));

    const integrationSettings = safeParseIntegrationSettings(
      integration.configStr
    );

    console.log(
      "integrationSettings",
      JSON.stringify(integrationSettings, null, 2)
    );

    // Check if this channel is in the selected channels
    if (!(integrationSettings?.selectedChannels ?? []).includes(channelName)) {
      return;
    }

    console.log("channelName is in the selected channels");

    // Get user info
    const userInfo = await client.users.info({
      user: message.user,
    });

    console.log("userInfo", JSON.stringify(userInfo, null, 2));

    if (!userInfo.ok || !userInfo.user) return;

    const userName = userInfo.user.real_name || userInfo.user.name || "Unknown";

    console.log("userName", userName);

    // Find or create author
    let authorId = store.query.author
      .first({ metaId: "slack:" + message.user })
      .get()?.id;

    if (!authorId) {
      authorId = ulid().toLowerCase();
      await fetchClient.mutate.author.insert({
        id: authorId,
        name: userName,
        userId: null,
        metaId: message.user,
        organizationId: integration.organizationId,
      });
    }

    console.log("isFirstMessage", isFirstMessage);

    if (isFirstMessage) {
      // Create new thread
      threadId = ulid().toLowerCase();

      // Get thread name from message text or use channel name
      const messageText = "text" in message ? message.text : undefined;
      const threadName =
        (messageText && messageText.length > 0
          ? messageText.substring(0, 100)
          : channelName) || channelName;

      store.mutate.thread.insert({
        id: threadId,
        organizationId: integration.organizationId,
        name: threadName,
        createdAt: new Date(parseFloat(message.ts) * 1000),
        deletedAt: null,
        discordChannelId: null,
        authorId: authorId,
        assignedUserId: null,
        externalId: message.ts,
        externalOrigin: "slack",
        externalMetadataStr: JSON.stringify({ channelId: message.channel }),
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
          await say({
            text: portalMessage,
            channel: message.channel,
            thread_ts: message.ts,
          });
        }
      } catch (error) {
        console.error("Error sending portal link message:", error);
      }
    } else {
      // Find existing thread
      const thread = store.query.thread
        .where({
          externalId: message.thread_ts,
          externalOrigin: "slack",
        })
        .get()?.[0];

      console.log("thread", JSON.stringify(thread, null, 2));

      if (!thread) return;

      console.log("thread found", JSON.stringify(thread, null, 2));

      threadId = thread.id;
    }

    console.log("threadId", threadId);

    if (!threadId) return;

    // Create message
    const messageText = "text" in message ? message.text : "";
    const messageContent = messageText || "";
    store.mutate.message.insert({
      id: ulid().toLowerCase(),
      threadId,
      authorId: authorId,
      content: JSON.stringify(parse(messageContent)),
      createdAt: new Date(parseFloat(message.ts) * 1000),
      origin: "slack",
      externalMessageId: message.ts,
    });

    console.log("message inserted", JSON.stringify(message, null, 2));
  }
);

const handleMessages = async (
  messages: InferLiveObject<
    (typeof schema)["message"],
    { thread: true; author: true }
  >[]
) => {
  for (const message of messages) {
    // TODO this is not consistent, either we make this part of the include or we wait until the store is bootstrapped. Remove the timeout when this is fixed.
    const integration = store.query.integration
      .first({
        organizationId: messages[0]?.thread?.organizationId,
        type: "slack",
      })
      .get();

    console.log("integration", JSON.stringify(integration, null, 2));
    console.log("messages", JSON.stringify(messages, null, 2));

    if (!integration || !integration.configStr) continue;

    const parsedConfig = safeParseIntegrationSettings(integration.configStr);

    if (!parsedConfig) continue;

    const teamId = parsedConfig.teamId;

    if (!teamId) continue;
    console.log("parsedConfig", JSON.stringify(parsedConfig, null, 2));

    const threadTs = message.thread.externalId;

    if (!threadTs) continue;

    let channelId: string | null = null;
    if (message.thread.externalMetadataStr) {
      try {
        const metadata = JSON.parse(message.thread.externalMetadataStr) as {
          channelId?: string;
        };
        channelId = metadata.channelId ?? null;
      } catch (error) {
        console.error("Error parsing externalMetadataStr:", error);
      }
    }

    if (!channelId) continue;

    try {
      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: stringify(safeParseJSON(message.content), {
          heading: true,
          horizontalRule: true,
        }),
        thread_ts: threadTs,
        username: message.author.name,
      });

      if (result.ok && result.ts) {
        store.mutate.message.update(message.id, {
          externalMessageId: result.ts,
        });
      }
    } catch (error) {
      console.error("Error sending Slack message:", error);
    }
  }
};

const formatUpdateMessage = (
  update: InferLiveObject<
    (typeof schema)["update"],
    { thread: true; user: true }
  >
): string => {
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
    if (replicated.slack) continue;

    if (handlingUpdates.has(update.id)) continue;

    // TODO this is not consistent, either we make this part of the include or we wait until the store is bootstrapped. Remove the timeout when this is fixed.
    const integration = store.query.integration
      .first({
        organizationId: update.thread?.organizationId,
        type: "slack",
      })
      .get();

    if (!integration || !integration.configStr) continue;

    const parsedConfig = safeParseIntegrationSettings(integration.configStr);

    if (!parsedConfig) continue;

    const teamId = parsedConfig.teamId;

    if (!teamId) continue;

    const threadTs = update.thread.externalId;

    if (!threadTs) continue;

    let channelId: string | null = null;
    if (update.thread.externalMetadataStr) {
      try {
        const metadata = JSON.parse(update.thread.externalMetadataStr) as {
          channelId?: string;
        };
        channelId = metadata.channelId ?? null;
      } catch (error) {
        console.error("Error parsing externalMetadataStr:", error);
      }
    }

    if (!channelId) continue;

    handlingUpdates.add(update.id);

    try {
      const updateMessage = formatUpdateMessage(update);
      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: updateMessage,
        thread_ts: threadTs,
      });

      if (result.ok && result.ts) {
        await fetchClient.mutate.update.update(update.id, {
          replicatedStr: JSON.stringify({
            ...replicated,
            slack: result.ts,
          }),
        });
      }
    } catch (error) {
      console.error("Error sending update bot message:", error);
    } finally {
      handlingUpdates.delete(update.id);
    }
  }
};

(async () => {
  await app.start(process.env.PORT || 3011);

  app.logger.info(
    `⚡️ Bolt app is running at port ${process.env.PORT || 3011}!`
  );

  setTimeout(async () => {
    // TODO Subscribe callback is not being triggered with current values - track https://github.com/pedroscosta/live-state/issues/82
    await handleMessages(
      await store.query.message
        .where({
          externalMessageId: null,
          thread: {
            externalOrigin: "slack",
            externalId: { $not: null },
            externalMetadataStr: { $not: null },
          },
        })
        .include({ thread: true, author: true })
        .get()
    );
    store.query.message
      .where({
        externalMessageId: null,
        thread: {
          externalOrigin: "slack",
          externalId: { $not: null },
          externalMetadataStr: { $not: null },
        },
      })
      .include({ thread: true, author: true })
      .subscribe(handleMessages);

    // Handle updates for threads linked to Slack
    const updates = await store.query.update
      .where({
        thread: {
          externalOrigin: "slack",
          externalId: { $not: null },
          externalMetadataStr: { $not: null },
        },
      })
      .include({ thread: true, user: true })
      .get();

    await handleUpdates(updates);
    store.query.update
      .where({
        thread: {
          externalOrigin: "slack",
          externalId: { $not: null },
          externalMetadataStr: { $not: null },
        },
      })
      .include({ thread: true, user: true })
      .subscribe(handleUpdates);
  }, 1000);
})();
