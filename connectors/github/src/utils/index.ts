export const STATUS_OPEN = 0;
export const STATUS_RESOLVED = 2;
export const STATUS_CLOSED = 3;

export const getBaseUrl = (): string =>
  process.env.VITE_BASE_URL || "http://localhost:3000";

export const getPort = (): number =>
  Number.parseInt(process.env.PORT || "3334", 10);

export const getGitHubConfig = () => ({
  appId: process.env.GITHUB_APP_ID as string,
  privateKey: process.env.GITHUB_PRIVATE_KEY as string,
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET as string,
  clientId: process.env.GITHUB_CLIENT_ID as string,
  clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
});
