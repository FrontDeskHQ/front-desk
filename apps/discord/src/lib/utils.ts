import { discordIntegrationSchema } from "@workspace/schemas/integration/discord";
import type { Message } from "discord.js";
import type z from "zod";

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
