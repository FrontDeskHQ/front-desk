import type { PostHog } from "posthog-js";
import { ulid } from "ulid";
import { fetchClient } from "~/lib/live-state";

export interface ActivateIntegrationOptions {
  organizationId: string;
  existingIntegrationId?: string;
  existingConfig?: Record<string, unknown>;
  posthog?: PostHog | null;
}

export const generateStateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

// Discord bot permissions number - read messages, send messages, and manage webhooks, ...
export const DISCORD_BOT_PERMISSIONS = "292594747456";

// Slack bot scopes - chat:write, channels:read, channels:history, groups:read, im:read, users:read
export const SLACK_BOT_SCOPES = [
  "channels:history",
  "channels:read",
  "chat:write",
  "chat:write.customize",
  "groups:history",
  "groups:read",
  "im:read",
  "users:read",
].join(",");

export async function activateDiscord({
  organizationId,
  existingIntegrationId,
  existingConfig,
  posthog,
}: ActivateIntegrationOptions) {
  const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

  if (!DISCORD_CLIENT_ID) {
    console.error("[Discord] Client ID is not configured");
    return;
  }

  const csrfToken = generateStateToken();

  if (existingIntegrationId) {
    await fetchClient.mutate.integration.update(existingIntegrationId, {
      enabled: false,
      updatedAt: new Date(),
      configStr: JSON.stringify({
        ...(existingConfig ?? {}),
        csrfToken,
      }),
    });
  } else {
    await fetchClient.mutate.integration.insert({
      id: ulid().toLowerCase(),
      organizationId,
      type: "discord",
      enabled: false,
      updatedAt: new Date(),
      createdAt: new Date(),
      configStr: JSON.stringify({
        ...(existingConfig ?? {}),
        csrfToken,
      }),
    });
  }

  const redirectUri = `${window.location.origin}/app/settings/organization/integration/discord/redirect`;

  const queryParams = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    permissions: DISCORD_BOT_PERMISSIONS,
    scope: "identify+bot", // We need identify because we wont get a redirect otherwise
    integration_type: "0", // Add to guild
    redirect_uri: redirectUri,
    state: `${organizationId}_${csrfToken}`,
    response_type: "code",
  });

  // https://discord.com/developers/docs/topics/oauth2#bot-authorization-flow
  const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?${queryParams
    .toString()
    .replaceAll("%2B", "+")}`;

  posthog?.capture("integration_enable", {
    integration_type: "discord",
  });

  // Wait briefly to ensure analytics event is transmitted before navigation
  await new Promise((resolve) => setTimeout(resolve, 300));

  window.location.href = discordOAuthUrl;
}

export async function activateSlack({
  organizationId,
  existingIntegrationId,
  existingConfig,
  posthog,
}: ActivateIntegrationOptions) {
  const SLACK_CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID;

  if (!SLACK_CLIENT_ID) {
    console.error("[Slack] Client ID is not configured");
    return;
  }

  const csrfToken = generateStateToken();

  if (existingIntegrationId) {
    await fetchClient.mutate.integration.update(existingIntegrationId, {
      enabled: false,
      updatedAt: new Date(),
      configStr: JSON.stringify({
        ...(existingConfig ?? {}),
        csrfToken,
      }),
    });
  } else {
    await fetchClient.mutate.integration.insert({
      id: ulid().toLowerCase(),
      organizationId,
      type: "slack",
      enabled: false,
      updatedAt: new Date(),
      createdAt: new Date(),
      configStr: JSON.stringify({
        ...(existingConfig ?? {}),
        csrfToken,
      }),
    });
  }

  const baseRedirectUri = `${window.location.origin}/app/settings/organization/integration/slack/redirect`;
  const redirectUri = `${
    import.meta.env.DEV ? "https://redirectmeto.com/" : ""
  }${baseRedirectUri}`;

  const queryParams = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: SLACK_BOT_SCOPES,
    redirect_uri: redirectUri,
    state: `${organizationId}_${csrfToken}`,
  });

  // https://api.slack.com/authentication/oauth-v2
  const slackOAuthUrl = `https://slack.com/oauth/v2/authorize?${queryParams.toString()}`;

  posthog?.capture("integration_enable", {
    integration_type: "slack",
  });

  // Wait briefly to ensure analytics event is transmitted before navigation
  await new Promise((resolve) => setTimeout(resolve, 300));

  window.location.href = slackOAuthUrl;
}
