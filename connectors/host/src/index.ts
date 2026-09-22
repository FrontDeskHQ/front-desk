import { createLiveStateClient } from "@connectors/framework/runtime";
import dotenv from "dotenv";

import { createConnectorHost } from "./host";
import { linearConnector } from "./linear";
import { readLinearOAuthEnvironment } from "./linear-oauth";
import { createLinearSync } from "./linear-sync";

dotenv.config({ path: [".env.local", ".env"] });

const port = Number.parseInt(process.env.PORT ?? "3336", 10);
let oauthEnvironment: ReturnType<typeof readLinearOAuthEnvironment> | undefined;
let linearSync: ReturnType<typeof createLinearSync> | undefined;
let linearFetchClient:
  | ReturnType<typeof createLiveStateClient>["fetchClient"]
  | undefined;
try {
  oauthEnvironment = readLinearOAuthEnvironment();
  const liveState = createLiveStateClient({
    botKey: process.env.DISCORD_BOT_KEY ?? "",
    label: "Linear",
  });
  linearFetchClient = liveState.fetchClient;
  linearSync = createLinearSync({
    environment: oauthEnvironment,
    fetchClient: liveState.fetchClient,
  });
} catch {
  console.info(
    "[Linear] OAuth is not configured; Linear integration is disabled"
  );
}
const app = createConnectorHost({
  connectors: [linearConnector],
  linearOAuthEnvironment: oauthEnvironment,
  linearSync:
    linearSync && linearFetchClient
      ? {
          ...linearSync,
          fetchClient: linearFetchClient,
          webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
        }
      : undefined,
  secret: process.env.DISCORD_BOT_KEY,
}).listen(port);

linearSync?.syncAll().catch((error) => {
  console.error("[Linear] Startup reconciliation failed:", error);
});
setInterval(
  () => {
    linearSync?.syncAll().catch((error) => {
      console.error("[Linear] Daily reconciliation failed:", error);
    });
  },
  24 * 60 * 60 * 1000
).unref();

console.log(`Connector host listening on port ${port}`);

export type App = typeof app;
