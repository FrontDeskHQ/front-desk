import { discordIntegrationSchema } from "./discord";
import { slackIntegrationSchema } from "./slack";

/** A support channel as "Import threads" addresses it. `id` is the key the
 * integration stores in `selectedChannels`: the Slack channel id, or the
 * Discord channel name. */
export interface SupportChannel {
  id: string;
  name: string;
}

const parseConfig = (configStr: string | null): unknown => {
  if (!configStr) {
    return {};
  }
  try {
    return JSON.parse(configStr);
  } catch {
    return {};
  }
};

/**
 * The support channels selected on a Slack or Discord integration, or `null`
 * for an integration type that has no support channels.
 */
export const selectedSupportChannels = (
  type: string,
  configStr: string | null
): SupportChannel[] | null => {
  const config = parseConfig(configStr);
  switch (type) {
    case "slack": {
      return (
        slackIntegrationSchema.safeParse(config).data?.selectedChannels ?? []
      );
    }
    case "discord": {
      const names =
        discordIntegrationSchema.safeParse(config).data?.selectedChannels ?? [];
      return names.map((name) => ({ id: name, name }));
    }
    default: {
      return null;
    }
  }
};
