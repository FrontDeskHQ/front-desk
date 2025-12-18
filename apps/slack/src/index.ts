import "./env";

import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { App } from "@slack/bolt";
import { parse } from "@workspace/ui/lib/md-tiptap";
import { ulid } from "ulid";
import { fetchClient, store } from "./lib/live-state";
import { safeParseIntegrationSettings } from "./lib/utils";

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

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

(async () => {
  await app.start(process.env.PORT || 3011);

  app.logger.info(
    `⚡️ Bolt app is running at port ${process.env.PORT || 3011}!`
  );
})();
