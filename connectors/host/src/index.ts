import { createLiveStateClient } from "@connectors/framework/runtime";
import dotenv from "dotenv";

import { createConnectorHost } from "./host";
import { linearConnector } from "./linear";
import { readLinearOAuthEnvironment } from "./linear-oauth";
import { createLinearSync } from "./linear-sync";
import { createLinearWebhookQueue } from "./linear-webhook";

dotenv.config({ path: [".env.local", ".env"] });

const port = Number.parseInt(process.env.PORT ?? "3336", 10);
let oauthEnvironment: ReturnType<typeof readLinearOAuthEnvironment> | undefined;
let linearSync: ReturnType<typeof createLinearSync> | undefined;
let linearWebhookSecret: string | undefined;
let linearFetchClient:
  | ReturnType<typeof createLiveStateClient>["fetchClient"]
  | undefined;
try {
  const configuredOAuthEnvironment = readLinearOAuthEnvironment();
  linearWebhookSecret = process.env.LINEAR_WEBHOOK_SECRET?.trim();
  if (!linearWebhookSecret) {
    throw new Error("LINEAR_WEBHOOK_SECRET_REQUIRED");
  }
  oauthEnvironment = configuredOAuthEnvironment;
  const liveState = createLiveStateClient({
    botKey: process.env.DISCORD_BOT_KEY ?? "",
    label: "Linear",
  });
  linearFetchClient = liveState.fetchClient;
  linearSync = createLinearSync({
    environment: oauthEnvironment,
    fetchClient: liveState.fetchClient,
  });
} catch (error) {
  console.error("[Linear] Linear integration disabled:", error);
}
const linearWebhookQueue =
  linearSync && linearFetchClient
    ? createLinearWebhookQueue({
        fetchClient: linearFetchClient,
        removeIssue: linearSync.removeIssue,
        syncIssue: linearSync.syncIssue,
      })
    : undefined;
const app = createConnectorHost({
  connectors: [linearConnector],
  linearOAuthEnvironment: oauthEnvironment,
  linearSync:
    linearSync && linearFetchClient && linearWebhookQueue
      ? {
          ...linearSync,
          fetchClient: linearFetchClient,
          enqueueWebhook: linearWebhookQueue.enqueue,
          webhookSecret: linearWebhookSecret,
        }
      : undefined,
  secret: process.env.DISCORD_BOT_KEY,
}).listen(port);

const startupRetryDelaysMs = [1000, 5000, 30_000];
const runStartupReconciliation = (attempt = 0): void => {
  linearSync?.syncAll().catch((error) => {
    console.error("[Linear] Startup reconciliation failed:", error);
    const retryDelay = startupRetryDelaysMs[attempt];
    if (retryDelay !== undefined) {
      setTimeout(
        () => runStartupReconciliation(attempt + 1),
        retryDelay
      ).unref();
    }
  });
};
runStartupReconciliation();
setInterval(
  () => {
    linearSync?.syncAll().catch((error) => {
      console.error("[Linear] Daily reconciliation failed:", error);
    });
  },
  24 * 60 * 60 * 1000
).unref();

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.stop();
    await linearWebhookQueue?.close();
  } catch (error) {
    console.error("[Linear] Failed to close webhook queue:", error);
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Connector host listening on port ${port}`);

export type App = typeof app;
