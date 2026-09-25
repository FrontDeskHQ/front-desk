import { createLiveStateClient } from "@connectors/framework/runtime";
import dotenv from "dotenv";

import { createConnectorHost } from "./host";
import { createLinearConnector } from "./linear";
import { readLinearOAuthEnvironment } from "./linear-oauth";
import { createLinearProvider } from "./linear-provider";
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

const linearProvider = createLinearProvider({
  connector: createLinearConnector({ environment: oauthEnvironment }),
  environment: oauthEnvironment,
  sync:
    linearSync && linearFetchClient && linearWebhookQueue
      ? {
          ...linearSync,
          fetchClient: linearFetchClient,
          enqueueWebhook: linearWebhookQueue.enqueue,
          webhookSecret: linearWebhookSecret,
          close: linearWebhookQueue.close,
        }
      : undefined,
});

const connectorHost = createConnectorHost({
  providers: [linearProvider],
  secret: process.env.DISCORD_BOT_KEY,
});
const app = connectorHost.app;

const start = async () => {
  try {
    await connectorHost.start();
    if (shuttingDown) return;
    app.listen(port);
    console.log(`Connector host listening on port ${port}`);
  } catch (error) {
    console.error("[connector-host] Failed to start:", error);
    try {
      await app.stop();
    } catch (stopError) {
      console.error(
        "[connector-host] Failed to stop after startup:",
        stopError
      );
    }
    try {
      await connectorHost.stop();
    } catch (stopError) {
      console.error(
        "[connector-host] Failed to clean up after startup:",
        stopError
      );
    }
    process.exit(1);
  }
};
void start();

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  let shutdownFailed = false;
  try {
    await app.stop();
  } catch (error) {
    shutdownFailed = true;
    console.error("[connector-host] Failed to stop listening:", error);
  }
  try {
    await connectorHost.stop();
  } catch (error) {
    shutdownFailed = true;
    console.error("[connector-host] Failed to stop providers:", error);
  }
  process.exit(shutdownFailed ? 1 : 0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export type App = typeof app;
