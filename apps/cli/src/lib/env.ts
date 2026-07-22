const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1"]);

export const getApiUrl = (): string =>
  process.env.FD_API_URL ?? "http://localhost:3333/api/ls";

export const getWebUrl = (): string =>
  process.env.FD_WEB_URL ?? "http://localhost:3000";

export const getDiscordBotKey = (): string => {
  const key = process.env.DISCORD_BOT_KEY;
  if (!key) {
    throw new Error(
      "DISCORD_BOT_KEY is required (set in apps/api/.env.local or apps/cli/.env.local)"
    );
  }
  return key;
};

export const getDefaultOrg = (): string | undefined => process.env.FD_DEV_ORG;

export const assertLocalhostApiUrl = (apiUrl: string): void => {
  let hostname: string;
  try {
    hostname = new URL(apiUrl).hostname;
  } catch {
    throw new Error(`Invalid FD_API_URL: ${apiUrl}`);
  }

  if (!LOCALHOST_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to run against non-localhost API (${hostname}). FD devtool is local-dev only.`
    );
  }
};
