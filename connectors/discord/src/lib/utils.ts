import {
  createBackfillHelpers,
  createSettingsParser,
} from "@connectors/framework/runtime";
import { discordIntegrationSchema } from "@workspace/schemas/integration/discord";
import type { Message } from "discord.js";
import { fetchClient } from "./live-state";

export { safeParseJSON } from "@connectors/framework/runtime";

export const { safeParseIntegrationSettings } = createSettingsParser(
  discordIntegrationSchema,
);

export const {
  withBackfillLock,
  updateBackfillStatus,
  updateSyncedChannels,
  getBackfillLimit,
} = createBackfillHelpers(fetchClient);

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
