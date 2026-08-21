import { z } from "zod";

const externalMetadataSchema = z.object({ channelId: z.string().optional() });

export type SlackTargetPrerequisiteFailureReason =
  | "channel_id_missing"
  | "integration_config_invalid"
  | "integration_config_missing"
  | "integration_not_found"
  | "team_id_missing"
  | "thread_metadata_invalid"
  | "thread_metadata_missing"
  | "thread_ts_missing";

export type SlackTargetPrerequisiteResolution =
  | {
      ok: true;
      target: {
        channelId: string;
        integrationId: string;
        teamId: string;
        threadTs: string;
      };
    }
  | {
      context?: Record<string, unknown>;
      ok: false;
      reason: SlackTargetPrerequisiteFailureReason;
    };

export const resolveSlackTargetPrerequisites = (options: {
  integration:
    | {
        configStr?: string | null;
        id: string;
      }
    | null
    | undefined;
  parseIntegrationConfig: (
    raw: string
  ) => { teamId?: string | null } | undefined;
  thread: {
    externalId?: string | null;
    externalMetadataStr?: string | null;
  };
}): SlackTargetPrerequisiteResolution => {
  const { integration, parseIntegrationConfig, thread } = options;
  if (!integration) {
    return { ok: false, reason: "integration_not_found" };
  }
  if (!integration.configStr) {
    return {
      context: { integrationId: integration.id },
      ok: false,
      reason: "integration_config_missing",
    };
  }

  const parsedConfig = parseIntegrationConfig(integration.configStr);
  if (!parsedConfig) {
    return {
      context: { integrationId: integration.id },
      ok: false,
      reason: "integration_config_invalid",
    };
  }
  const teamId = parsedConfig.teamId;
  if (!teamId) {
    return {
      context: { integrationId: integration.id },
      ok: false,
      reason: "team_id_missing",
    };
  }

  const threadTs = thread.externalId;
  if (!threadTs) {
    return {
      context: { integrationId: integration.id, teamId },
      ok: false,
      reason: "thread_ts_missing",
    };
  }

  if (!thread.externalMetadataStr) {
    return {
      context: { integrationId: integration.id, teamId },
      ok: false,
      reason: "thread_metadata_missing",
    };
  }

  let channelId: string | undefined;
  try {
    channelId = externalMetadataSchema.parse(
      JSON.parse(thread.externalMetadataStr)
    ).channelId;
  } catch {
    return {
      context: { integrationId: integration.id, teamId },
      ok: false,
      reason: "thread_metadata_invalid",
    };
  }

  if (!channelId) {
    return {
      context: { integrationId: integration.id, teamId },
      ok: false,
      reason: "channel_id_missing",
    };
  }

  return {
    ok: true,
    target: { channelId, integrationId: integration.id, teamId, threadTs },
  };
};
