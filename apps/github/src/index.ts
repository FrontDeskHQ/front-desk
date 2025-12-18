import { createServer } from "node:http";
import { App, createNodeMiddleware } from "octokit";
import "./env";
import fs from "node:fs";

// Get and validate required environment variables
const requiredEnvVars = [
  "GITHUB_APP_ID",
  "PRIVATE_KEY_PATH",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];

for (const varName of requiredEnvVars) {
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

// Handle webhook errors
app.webhooks.onError((error) => {
  console.error(error);
});

// Handle OAuth token creation
app.oauth.on("token.created", async ({ token, octokit }) => {
  console.log("OAuth token created successfully", token);

  // TODO: Add any necessary post-authentication logic here
  // Code from docs: https://github.com/octokit/octokit.js?tab=readme-ov-file#oauth
  // await octokit.rest.activity.setRepoSubscription({
  //   owner: "octocat",
  //   repo: "hello-world",
  //   subscribed: true,
  // });
});

// App can receive webhook events at `/api/github/webhooks`
createServer(createNodeMiddleware(app)).listen(process.env.PORT || 3334);
