import "./env";

import type { InferLiveObject } from "@live-state/sync";
import type {
  AllMiddlewareArgs,
  AuthorizeResult,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { parse } from "@workspace/ui/lib/md-tiptap";
import { stringify } from "@workspace/ui/lib/tiptap-md";
import type { schema } from "api/schema";
import { ulid } from "ulid";
import { installationStore } from "./lib/installation-store";
import { fetchClient, store } from "./lib/live-state";
import { safeParseIntegrationSettings } from "./lib/utils";

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
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
          `Bot token not found in installation for teamId: ${teamId}`
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
        error
      );
      throw error;
    }
  },
});

const safeParseJSON = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return (parsed as { content?: unknown }).content ?? [];
    }
  } catch {}
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

const buildPortalBotText = ({
  portalUrl,
  relatedThreadLinks,
}: {
  portalUrl: string;
  relatedThreadLinks: RelatedThreadLink[];
}) => {
  const lines = [
    `This thread is also being tracked in our community portal: <${portalUrl}|Open in portal>`,
  ];

  if (relatedThreadLinks.length > 0) {
    lines.push("");
    lines.push("Related threads on the portal:");
    for (const link of relatedThreadLinks) {
      if (link.name) {
        lines.push(`• <${link.url}|${link.name}>`);
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
        `Bot token not found in installation for teamId: ${teamId}`
      );
      return null;
    }

    return new WebClient(botToken);
  } catch (error) {
    console.error(`Failed to get client for teamId: ${teamId}`, error);
    return null;
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

    let threadId: string | null = null;

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
      integration.configStr
    );

    if (!(integrationSettings?.selectedChannels ?? []).includes(channelName)) {
      return;
    }

    const userInfo = await client.users.info({
      user: message.user,
    });

    if (!userInfo.ok || !userInfo.user) return;

    const userName = userInfo.user.real_name || userInfo.user.name || "Unknown";

    let authorId = store.query.author
      .first({ metaId: `slack:${message.user}` })
      .get()?.id;

    if (!authorId) {
      authorId = ulid().toLowerCase();
      await fetchClient.mutate.author.insert({
        id: authorId,
        name: userName,
        userId: null,
        metaId: `slack:${message.user}`,
        organizationId: integration.organizationId,
      });
    }

    if (isFirstMessage) {
      threadId = ulid().toLowerCase();
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
        externalIssueId: null,
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
            const portalUrl = buildPortalThreadUrl(
              baseUrl,
              organization.slug,
              threadId
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
              thread_ts: message.ts,
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
    } else {
      const thread = store.query.thread
        .first({
          externalId: message.thread_ts,
          externalOrigin: "slack",
        })
        .get();

      if (!thread) return;

      threadId = thread.id;
    }

    if (!threadId) return;
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
  }
);

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
        type: "slack",
      })
      .get();

    if (!integration || !integration.configStr) continue;

    const parsedConfig = safeParseIntegrationSettings(integration.configStr);

    if (!parsedConfig) continue;

    const teamId = parsedConfig.teamId;

    if (!teamId) continue;

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
      const client = await getClientForTeam(teamId);
      if (!client) continue;

      const result = await client.chat.postMessage({
        channel: channelId,
        text: stringify(safeParseJSON(message.content), {
          heading: true,
          horizontalRule: true,
        }),
        thread_ts: threadTs,
        username: message.author.name,
        icon_url: message.author?.user?.image ?? undefined,
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
      const client = await getClientForTeam(teamId);
      if (!client) {
        handlingUpdates.delete(update.id);
        continue;
      }

      const updateMessage = formatUpdateMessage(update);
      const result = await client.chat.postMessage({
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
        .include({ thread: true, author: { user: true } })
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
      .include({ thread: true, author: { user: true } })
      .subscribe(handleMessages);

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
