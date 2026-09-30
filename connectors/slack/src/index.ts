import "./env";
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
} from "@connectors/framework/runtime";
import type {
  AllMiddlewareArgs,
  AuthorizeResult,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";
import {
  createLogger,
  flushSharedLogger,
  initSharedLogger,
} from "@workspace/utils/logging";
import { parse } from "@workspace/utils/md-tiptap";

import { slackAuthorName } from "./lib/author-name";
import { closeDigestWorker, initializeDigestWorker } from "./lib/digest-queue";
import { installationStore } from "./lib/installation-store";
import { fetchClient, store } from "./lib/live-state";
import { formatSlackOutboundText } from "./lib/markdown-to-mrkdwn";
import { resolveSlackTargetPrerequisites } from "./lib/outbound-target";
import type { SlackTargetPrerequisiteFailureReason } from "./lib/outbound-target";
import { safeParseIntegrationSettings } from "./lib/utils";

initSharedLogger({ service: "slack-connector" });

const toLogError = (error: unknown, fallback: string): Error =>
  error instanceof Error ? error : new Error(fallback);

interface SlackEventEnvelope {
  api_app_id?: string;
  event?: {
    channel?: string;
    subtype?: string;
    thread_ts?: string;
    ts?: string;
    type?: string;
    user?: string;
  };
  event_id?: string;
  team_id?: string;
  type?: string;
}

/** Slack drops the HTTP request if we don't ack within ~3s. */
const SLACK_ACK_DEADLINE_MS = 3000;

const app = new App({
  authorize: async ({ teamId, enterpriseId }): Promise<AuthorizeResult> => {
    const startedAt = Date.now();
    const requestLog = createLogger({
      action: "connector.authorize",
      operation: "slack.events.authorize",
      provider: "slack",
      slack: { enterpriseId, teamId },
    });
    let status = 200;

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

      requestLog.set({ authorize: { outcome: "ok" } });
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
      status = 401;
      requestLog.set({ authorize: { outcome: "failed" } });
      requestLog.error(toLogError(error, "Slack authorization failed"), {
        step: "authorize",
      });
      throw error;
    } finally {
      const durationMs = Date.now() - startedAt;
      requestLog.set({
        durationMs,
        late: durationMs > SLACK_ACK_DEADLINE_MS,
      });
      requestLog.emit({ status });
    }
  },
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

          const channels: {
            id: string;
            name: string;
            isPrivate: boolean;
          }[] = [];
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
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const originalProcessEvent = app.processEvent.bind(app);
app.processEvent = async (event) => {
  const receivedAt = Date.now();
  const body = event.body as SlackEventEnvelope;
  const innerAck = event.ack;
  let ackLogged = false;

  event.ack = async (response) => {
    if (!ackLogged) {
      ackLogged = true;
      const durationMs = Date.now() - receivedAt;
      createLogger({
        action: "connector.inbound_event",
        operation: "slack.events.ack",
        provider: "slack",
        slack: {
          bodyType: body.type,
          durationMs,
          eventId: body.event_id,
          eventType: body.event?.type,
          late: durationMs > SLACK_ACK_DEADLINE_MS,
          retryNum: event.retryNum,
          retryReason: event.retryReason,
          teamId: body.team_id,
        },
      }).emit({
        status: durationMs > SLACK_ACK_DEADLINE_MS ? 408 : 200,
      });
    }
    return innerAck(response);
  };

  createLogger({
    action: "connector.inbound_event",
    operation: "slack.events.receive",
    provider: "slack",
    slack: {
      apiAppId: body.api_app_id,
      bodyType: body.type,
      channelId: body.event?.channel,
      eventId: body.event_id,
      eventType: body.event?.type,
      retryNum: event.retryNum,
      retryReason: event.retryReason,
      subtype: body.event?.subtype,
      teamId: body.team_id,
      threadTs: body.event?.thread_ts,
      ts: body.event?.ts,
      userId: body.event?.user,
    },
  }).emit({ status: 200 });

  try {
    return await originalProcessEvent(event);
  } catch (error) {
    const requestLog = createLogger({
      action: "connector.inbound_event",
      operation: "slack.events.process",
      provider: "slack",
      slack: {
        bodyType: body.type,
        durationMs: Date.now() - receivedAt,
        eventId: body.event_id,
        eventType: body.event?.type,
        teamId: body.team_id,
      },
    });
    requestLog.error(toLogError(error, "Slack processEvent failed"), {
      step: "process_event",
    });
    requestLog.emit({ status: 500 });
    throw error;
  }
};

type SlackClientResolution =
  | { client: WebClient; ok: true }
  | {
      error?: unknown;
      ok: false;
      reason: "bot_token_missing" | "installation_lookup_failed";
    };

const resolveClientForTeam = async (
  teamId: string
): Promise<SlackClientResolution> => {
  try {
    const installation = await installationStore.fetchInstallation({
      enterpriseId: undefined,
      isEnterpriseInstall: false,
      teamId,
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
      return { ok: false, reason: "bot_token_missing" };
    }

    return { client: new WebClient(botToken), ok: true };
  } catch (error) {
    return { error, ok: false, reason: "installation_lookup_failed" };
  }
};

const getClientForTeam = async (teamId: string): Promise<WebClient | null> => {
  const resolution = await resolveClientForTeam(teamId);
  if (resolution.ok) {
    return resolution.client;
  }

  if (resolution.reason === "bot_token_missing") {
    console.error(`Bot token not found in installation for teamId: ${teamId}`);
  } else {
    console.error(
      `Failed to get client for teamId: ${teamId}`,
      resolution.error
    );
  }

  return null;
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
  slackUserId: string
): Promise<{ externalId: string; name: string }> => {
  let userName = "Unknown";
  try {
    const userInfo = await client.users.info({ user: slackUserId });
    if (userInfo.ok && userInfo.user) {
      userName = slackAuthorName(userInfo.user);
    }
  } catch (error) {
    console.error(
      `[Slack] Error fetching user info for ${slackUserId}:`,
      error
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
}) =>
  fetchClient.mutate.ingest.ingest({
    author: {
      externalId: args.author.externalId,
      name: args.author.name,
    },
    externalThreadId: args.externalThreadId,
    message: {
      body: parse(args.text || ""),
      createdAt: new Date(Number.parseFloat(args.ts) * 1000),
      externalMessageId: args.ts,
    },
    organizationId: args.organizationId,
    provider: SLACK_PROVIDER,
    thread: args.threadTitle
      ? {
          title: ensureThreadTitle(args.threadTitle),
          externalMetadata: { channelId: args.channelId },
        }
      : undefined,
  });

/** First 100 chars of the root message, falling back to a channel-based title. */
const slackThreadTitle = (rootText: string | undefined, fallback: string) =>
  rootText && rootText.length > 0 ? rootText.slice(0, 100) : fallback;

/** Live ingestion's rule for a message FrontDesk should see (see `app.message`). */
const isIngestibleSlackMessage = (
  message: MessageElement
): message is MessageElement & { ts: string; user: string } =>
  !message.subtype &&
  !message.bot_id &&
  !message.bot_profile &&
  !!message.user &&
  !!message.ts;

/**
 * "Import threads" source for one Slack integration. Every top-level user
 * message in a selected channel is a thread, exactly as live ingestion treats
 * it, whether or not it has replies.
 */
const createSlackImportSource = (
  client: WebClient,
  channels: { id: string; name: string }[]
): ThreadImportSource => {
  const channelByThread = new Map<string, { id: string; name: string }>();
  const authors = new Map<
    string,
    Promise<{ externalId: string; name: string }>
  >();
  const resolveAuthor = (slackUserId: string) => {
    let author = authors.get(slackUserId);
    if (!author) {
      author = resolveSlackAuthor(client, slackUserId);
      authors.set(slackUserId, author);
    }
    return author;
  };

  async function* listChannelThreads(channel: { id: string; name: string }) {
    let cursor: string | undefined;
    do {
      const page = await client.conversations.history({
        channel: channel.id,
        cursor,
        limit: 200,
      });
      if (!page.ok) {
        throw new Error(
          `Slack conversations.history failed for ${channel.id}: ${page.error}`
        );
      }
      const candidates: ThreadImportCandidate[] = [];
      for (const message of page.messages ?? []) {
        const isRoot = !message.thread_ts || message.thread_ts === message.ts;
        // A bot or workflow root still becomes a thread live once a person
        // replies, so a root with replies is a candidate either way.
        const hasReplies = (message.reply_count ?? 0) > 0;
        if (
          isRoot &&
          message.ts &&
          (isIngestibleSlackMessage(message) || hasReplies)
        ) {
          channelByThread.set(message.ts, channel);
          candidates.push({
            externalThreadId: message.ts,
            startedAt: Number.parseFloat(message.ts) * 1000,
          });
        }
      }
      yield candidates;
      cursor = page.response_metadata?.next_cursor || undefined;
    } while (cursor);
  }

  const load = async (
    candidate: ThreadImportCandidate
  ): Promise<ThreadImportPayload | null> => {
    const threadTs = candidate.externalThreadId;
    const channel = channelByThread.get(threadTs);
    if (!channel) {
      return null;
    }

    const replies: MessageElement[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.conversations.replies({
        channel: channel.id,
        cursor,
        limit: 200,
        ts: threadTs,
      });
      if (!page.ok) {
        throw new Error(
          `Slack conversations.replies failed for ${threadTs}: ${page.error}`
        );
      }
      replies.push(...(page.messages ?? []));
      cursor = page.response_metadata?.next_cursor || undefined;
    } while (cursor);

    const messages = replies
      .filter(isIngestibleSlackMessage)
      .toSorted((a, b) => Number.parseFloat(a.ts) - Number.parseFloat(b.ts));
    if (messages.length === 0) {
      return null;
    }
    // Live ingestion titles a thread from its root only when a person wrote
    // the root; otherwise the channel name.
    const root = messages[0]?.ts === threadTs ? messages[0] : undefined;

    return {
      externalThreadId: threadTs,
      messages: await Promise.all(
        messages.map(async (message) => ({
          author: await resolveAuthor(message.user),
          body: parse(message.text || ""),
          createdAt: new Date(Number.parseFloat(message.ts) * 1000),
          externalMessageId: message.ts,
        }))
      ),
      thread: {
        externalMetadata: { channelId: channel.id },
        title: ensureThreadTitle(slackThreadTitle(root?.text, channel.name)),
      },
    };
  };

  return { channels: channels.map(listChannelThreads), load };
};

const resolveSlackImportSource = async ({
  integrationId,
}: ThreadImportJobData): Promise<ThreadImportSource | null> => {
  const integration = await fetchClient.query.integration.byId({
    id: integrationId,
  });
  const settings = safeParseIntegrationSettings(integration?.configStr ?? null);
  if (!integration?.enabled || !settings?.teamId) {
    return null;
  }
  const client = await getClientForTeam(settings.teamId);
  if (!client) {
    throw new Error(`Could not get Slack client for team ${settings.teamId}`);
  }
  return createSlackImportSource(client, settings.selectedChannels ?? []);
};

app.message(
  async ({
    message,
    ack,
    client,
    context,
  }: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs) => {
    const startedAt = Date.now();
    const requestLog = createLogger({
      action: "connector.inbound_message",
      operation: "slack.events.message",
      provider: "slack",
      slack: {
        channelId: message.channel,
        retryNum: context.retryNum,
        retryReason: context.retryReason,
        subtype: "subtype" in message ? message.subtype : undefined,
        teamId: context.teamId,
        threadTs: "thread_ts" in message ? message.thread_ts : undefined,
        ts: message.ts,
        userId: "user" in message ? message.user : undefined,
      },
    });
    let status = 200;

    try {
      // Slack SDK is VERY BAD
      if (ack && typeof ack === "function") {
        const ackAt = Date.now();
        await (ack as () => Promise<void>)();
        requestLog.set({
          ack: { durationMs: Date.now() - ackAt, offsetMs: ackAt - startedAt },
        });
      }

      if (!("user" in message) || !message.user) {
        requestLog.set({
          ingest: { outcome: "skipped", reason: "missing_user" },
        });
        return;
      }

      // Filter out bot messages and system messages (any message with a subtype)
      if (message.subtype || "bot_id" in message || "bot_profile" in message) {
        requestLog.set({
          ingest: { outcome: "skipped", reason: "bot_or_subtype" },
        });
        return;
      }

      const isFirstMessage = !("thread_ts" in message);

      const conversationStartedAt = Date.now();
      const conversation = await client.conversations.info({
        channel: message.channel,
      });
      requestLog.set({
        conversationInfoMs: Date.now() - conversationStartedAt,
      });

      if (!conversation.ok || !conversation.channel) {
        requestLog.set({
          ingest: { outcome: "skipped", reason: "conversation_lookup_failed" },
          slackApi: {
            ok: conversation.ok,
            error: "error" in conversation ? conversation.error : undefined,
          },
        });
        return;
      }

      const channelName = conversation.channel.name;
      if (!channelName) {
        requestLog.set({
          ingest: { outcome: "skipped", reason: "missing_channel_name" },
        });
        return;
      }

      const teamId = conversation.channel.context_team_id;
      requestLog.set({ conversationTeamId: teamId });
      const slackIntegrations = store.query.integration
        .where({ type: "slack" })
        .get();
      const integration = slackIntegrations.find((i) => {
        const parsed = safeParseIntegrationSettings(i.configStr);
        return parsed?.teamId === teamId;
      });

      if (!integration) {
        requestLog.set({
          ingest: {
            outcome: "skipped",
            reason: "integration_not_found",
            slackIntegrationCount: slackIntegrations.length,
          },
        });
        return;
      }

      const integrationSettings = safeParseIntegrationSettings(
        integration.configStr
      );

      const channelId = conversation.channel.id;
      if (
        !channelId ||
        !(integrationSettings?.selectedChannels ?? []).some(
          (c) => c.id === channelId
        )
      ) {
        requestLog.set({
          ingest: { outcome: "skipped", reason: "channel_not_selected" },
          integration: { id: integration.id },
          selectedChannelCount:
            integrationSettings?.selectedChannels?.length ?? 0,
        });
        return;
      }

      const authorStartedAt = Date.now();
      const author = await resolveSlackAuthor(client, message.user);
      const ingestStartedAt = Date.now();
      const messageText = "text" in message ? message.text : undefined;

      // `externalThreadId` is the root `ts` in both cases — the reply carries it
      // as `thread_ts`.
      const externalThreadId = isFirstMessage ? message.ts : message.thread_ts;
      if (!externalThreadId) {
        requestLog.set({
          ingest: { outcome: "skipped", reason: "missing_thread_id" },
        });
        return;
      }

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
        author,
        channelId: message.channel,
        externalThreadId,
        organizationId: integration.organizationId,
        text: messageText || "",
        threadTitle,
        ts: message.ts,
      });
      requestLog.set({
        ingestMs: Date.now() - ingestStartedAt,
        resolveAuthorMs: ingestStartedAt - authorStartedAt,
      });

      if (!thread) {
        requestLog.set({
          ingest: { outcome: "skipped", reason: "ingest_returned_no_thread" },
          integration: { id: integration.id },
        });
        return;
      }
      const threadId = thread.id;
      requestLog.set({
        ingest: {
          created,
          outcome: created ? "thread_created" : "message_appended",
        },
        thread: { id: threadId },
        integration: { id: integration.id },
      });
    } catch (error) {
      status = 500;
      requestLog.set({ ingest: { outcome: "failed" } });
      requestLog.error(toLogError(error, "Slack message ingest failed"), {
        step: "ingest_message",
      });
    } finally {
      requestLog.set({ durationMs: Date.now() - startedAt });
      requestLog.emit({ status });
    }
  }
);

/**
 * Resolve the Slack workspace client + channel/thread a normalized thread maps
 * to, or `null` if this connector can't currently deliver to it. The parent
 * channel id lives in the thread's `externalMetadataStr`; the thread ts on
 * `externalId`.
 */
type SlackTargetFailureReason =
  | "bot_token_missing"
  | "installation_lookup_failed"
  | SlackTargetPrerequisiteFailureReason;

type SlackTargetResolution =
  | {
      ok: true;
      target: {
        channelId: string;
        client: WebClient;
        integrationId: string;
        teamId: string;
        threadTs: string;
      };
    }
  | {
      context?: Record<string, unknown>;
      error?: unknown;
      ok: false;
      reason: SlackTargetFailureReason;
    };

const resolveSlackTarget = async (thread: {
  organizationId?: string;
  externalId?: string | null;
  externalMetadataStr?: string | null;
}): Promise<SlackTargetResolution> => {
  const integration = store.query.integration
    .first({ organizationId: thread?.organizationId, type: "slack" })
    .get();
  const prerequisiteResolution = resolveSlackTargetPrerequisites({
    integration,
    parseIntegrationConfig: safeParseIntegrationSettings,
    thread,
  });
  if (!prerequisiteResolution.ok) {
    return prerequisiteResolution;
  }
  const { channelId, integrationId, teamId, threadTs } =
    prerequisiteResolution.target;

  const clientResolution = await resolveClientForTeam(teamId);
  if (!clientResolution.ok) {
    return {
      context: { channelId, integrationId, teamId },
      error: clientResolution.error,
      ok: false,
      reason: clientResolution.reason,
    };
  }

  return {
    ok: true,
    target: {
      channelId,
      client: clientResolution.client,
      integrationId,
      teamId,
      threadTs,
    },
  };
};

/**
 * Deliver one outbound reply to Slack. Returns the message `ts` to round-trip,
 * or `null` to leave it for the next pass.
 */
const deliverSlackMessage = async (
  message: OutboundMessage
): Promise<string | null> => {
  const requestLog = createLogger({
    action: "connector.outbound_reply",
    message: {
      id: message.id,
      origin: message.origin,
    },
    operation: "slack.reply.sync",
    provider: "slack",
    thread: {
      externalOrigin: message.thread.externalOrigin,
      hasExternalId: Boolean(message.thread.externalId),
      hasExternalMetadata: Boolean(message.thread.externalMetadataStr),
      id: message.thread.id,
      organizationId: message.thread.organizationId,
    },
  });
  let status = 500;

  try {
    const resolution = await resolveSlackTarget(message.thread);
    if (!resolution.ok) {
      requestLog.set({
        delivery: {
          outcome: "blocked",
          reason: resolution.reason,
        },
        slack: resolution.context,
      });
      if (resolution.error !== undefined) {
        requestLog.error(
          toLogError(resolution.error, "Slack target resolution failed"),
          { step: "resolve_target" }
        );
      }
      status = 424;
      return null;
    }

    const { target } = resolution;
    requestLog.set({
      slack: {
        channelId: target.channelId,
        integrationId: target.integrationId,
        teamId: target.teamId,
        threadTs: target.threadTs,
      },
    });

    const result = await target.client.chat.postMessage({
      channel: target.channelId,
      icon_url: message.author?.user?.image ?? undefined,
      text: formatSlackOutboundText(message.content),
      thread_ts: target.threadTs,
      username: message.author.name,
    });

    if (!result.ok) {
      const slackError =
        "error" in result && typeof result.error === "string"
          ? result.error
          : undefined;
      requestLog.set({
        delivery: {
          outcome: "rejected",
          reason: "slack_api_not_ok",
          ...(slackError ? { slackError } : {}),
        },
      });
      status = 502;
      return null;
    }

    if (!result.ts) {
      requestLog.set({
        delivery: {
          outcome: "rejected",
          reason: "slack_response_missing_ts",
        },
      });
      status = 502;
      return null;
    }

    requestLog.set({
      delivery: {
        externalMessageId: result.ts,
        outcome: "delivered",
      },
    });
    status = 200;
    return result.ts;
  } catch (error) {
    requestLog.set({
      delivery: { outcome: "failed", reason: "slack_api_exception" },
    });
    requestLog.error(toLogError(error, "Slack API call failed"), {
      step: "slack_api",
    });
    status = 502;
    return null;
  } finally {
    requestLog.emit({ status });
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
  update: OutboundUpdate
): Promise<string | null> => {
  const resolution = await resolveSlackTarget(update.thread);
  if (!resolution.ok) {
    return null;
  }
  const { target } = resolution;

  const result = await target.client.chat.postMessage({
    channel: target.channelId,
    text: formatUpdateMessage(update),
    thread_ts: target.threadTs,
  });

  return result.ok && result.ts ? result.ts : null;
};

let closeThreadImportWorker = async (): Promise<void> => {};

(async () => {
  await app.start(process.env.PORT || 3011);

  createLogger({
    action: "connector.startup",
    operation: "slack.clock",
    provider: "slack",
    clock: {
      iso: new Date().toISOString(),
      unixSec: Math.floor(Date.now() / 1000),
    },
  }).emit({ status: 200 });

  app.logger.info(
    `⚡️ Bolt app is running at port ${process.env.PORT || 3011}!`
  );

  const threadImportWorker = startThreadImportWorker({
    fetchClient,
    provider: SLACK_PROVIDER,
    resolveSource: resolveSlackImportSource,
  });
  closeThreadImportWorker = () => threadImportWorker.close();

  // Initialize the digest delivery worker
  initializeDigestWorker(getClientForTeam);

  setTimeout(async () => {
    // Watch un-replicated outbound messages/updates for Slack threads and
    // deliver them; the framework owns the round-trip of external message ids.
    // Do not pre-filter missing Slack target metadata here: the resolver emits
    // a reason-coded event for malformed legacy rows instead of hiding them.
    await startOutboundReplication({
      deliverMessage: deliverSlackMessage,
      deliverUpdate: deliverSlackUpdate,
      fetchClient,
      provider: "slack",
      store,
    });
  }, 1000);
})();

// Graceful shutdown
const shutdown = async () => {
  console.log("[Slack] Shutting down...");
  await closeThreadImportWorker();
  await closeDigestWorker();
  try {
    await flushSharedLogger();
  } catch (error) {
    console.error("[Slack] Failed to flush shared logger:", error);
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
