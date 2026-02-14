import { discordIntegrationSchema } from "@workspace/schemas/integration/discord";
import type { Message } from "discord.js";
import type z from "zod";
import { fetchClient } from "./live-state";

export const safeParseIntegrationSettings = (
  configStr: string | null,
): z.infer<typeof discordIntegrationSchema> | undefined => {
  if (!configStr) return undefined;
  try {
    return discordIntegrationSchema.parse(JSON.parse(configStr));
  } catch {
    return undefined;
  }
};

export const updateBackfillStatus = async (
  integrationId: string,
  configStr: string | null,
  backfill: {
    processed: number;
    total: number;
    limit: number | null;
    channelsDiscovering: number;
  } | null,
) => {
  const current = safeParseIntegrationSettings(configStr) ?? {};
  await fetchClient.mutate.integration.update(integrationId, {
    configStr: JSON.stringify({ ...current, backfill }),
  });
};

export const updateSyncedChannels = async (
  integrationId: string,
  configStr: string | null,
  syncedChannels: string[],
) => {
  const current = safeParseIntegrationSettings(configStr) ?? {};
  await fetchClient.mutate.integration.update(integrationId, {
    configStr: JSON.stringify({ ...current, syncedChannels }),
  });
};

export const getBackfillLimit = async (
  organizationId: string,
): Promise<number | null> => {
  const subscription = await fetchClient.query.subscription
    .first({ organizationId })
    .get();
  if (!subscription || subscription.plan === "trial") {
    return 100;
  }
  return null;
};

// Per-integration async mutex to serialize backfill status read-modify-write operations
const backfillLocks = new Map<string, Promise<void>>();

export const withBackfillLock = async <T>(
  integrationId: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const existing = backfillLocks.get(integrationId) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  backfillLocks.set(integrationId, next);

  try {
    await existing;
    return await fn();
  } finally {
    resolve!();
    if (backfillLocks.get(integrationId) === next) {
      backfillLocks.delete(integrationId);
    }
  }
};

export const safeParseJSON = (raw: string) => {
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

export const parseContentAsMarkdown = (message: Message): string => {
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
