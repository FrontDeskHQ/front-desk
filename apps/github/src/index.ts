import { createServer } from "node:http";
import { App, createNodeMiddleware } from "octokit";
import "./env";
import fs from "node:fs";

const githubAppEnvVars = [
  "GITHUB_APP_ID",
  "PRIVATE_KEY_PATH",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];

for (const varName of githubAppEnvVars) {
  if (!process.env[varName]) {
    console.error(`${varName} not set`);
    process.exit(1);
  }
}

const appId = process.env.GITHUB_APP_ID as string;
const privateKeyPath = process.env.PRIVATE_KEY_PATH as string;
let privateKey: string;
try {
  privateKey = fs.readFileSync(privateKeyPath, "utf8");
} catch (error) {
  console.error(`Failed to read private key from ${privateKeyPath}:`, error);
  process.exit(1);
}
const secret = process.env.GITHUB_WEBHOOK_SECRET as string;
const clientId = process.env.GITHUB_CLIENT_ID as string;
const clientSecret = process.env.GITHUB_CLIENT_SECRET as string;

const app = new App({
  appId,
  privateKey,
  webhooks: { secret },
  oauth: {
    clientId,
    clientSecret,
  },
});

// Log all received webhook events
app.webhooks.onAny(async ({ payload }) => {
  console.log("Received event:", payload);
});

// Error handling
app.webhooks.onError((error) => {
  console.error(error);
});

// App can receive webhook events at `/api/github/webhooks`
createServer(createNodeMiddleware(app)).listen(process.env.PORT || 3334);
