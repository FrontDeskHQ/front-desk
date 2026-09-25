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
const app = connectorHost.app.listen(port);
void connectorHost.start();

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await connectorHost.stop();
    await app.stop();
  } catch (error) {
    console.error("[connector-host] Failed to shut down:", error);
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Connector host listening on port ${port}`);

export type App = typeof app;
