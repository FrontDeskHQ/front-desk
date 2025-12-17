import "./env";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { parse } from "@workspace/ui/lib/md-tiptap";
import { ulid } from "ulid";
import { fetchClient, store } from "./lib/live-state";
import { safeParseIntegrationSettings } from "./lib/utils";
import * as http from "node:http";

//TODO: Refactor to fetch secret from integrations table and check if it's enabled
// Create Webhooks instance based on secret
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
if (!webhookSecret) process.exit(1);

const webhooks = new Webhooks({
  secret: webhookSecret,
});

// Helper function to find matching integration
const findIntegration = (installationId: string, repoFullName: string) => {
  return store.query.integration
    .where({ type: "github" })
    .get()
    .find((i) => {
      const parsed = safeParseIntegrationSettings(i.configStr);
      if (!parsed) return false;

      const repoMatch = `${parsed.repositoryOwner}/${parsed.repositoryName}`;
      return (
        parsed.installationId === installationId && repoMatch === repoFullName
      );
    });
};

// Handle new issues
webhooks.on("issues.opened", async ({ payload }) => {
  console.debug("=== WEBHOOK EVENT: issues.opened ===");
  console.debug(`New issue: ${payload.issue.title} (#${payload.issue.number})`);
  console.debug(`Repository: ${payload.repository.full_name}`);
  console.debug(`Installation ID: ${payload.installation?.id}`);

  const integration = findIntegration(
    String(payload.installation?.id ?? ""),
    payload.repository.full_name
  );

  if (!integration) {
    console.debug("No matching integration found");
    return;
  }

  const integrationSettings = safeParseIntegrationSettings(
    integration.configStr
  );
  if (!integrationSettings?.selectedEvents.includes("issues")) {
    console.debug("Issues event not enabled for this integration");
    return;
  }

  // Get or create author
  if (!payload.issue.user) {
    console.debug("Issue user is null, skipping");
    return;
  }

  let authorId = store.query.author
    .first({ metaId: String(payload.issue.user.id) })
    .get()?.id;

  if (!authorId) {
    authorId = ulid().toLowerCase();
    await fetchClient.mutate.author.insert({
      id: authorId,
      name: payload.issue.user.login,
      userId: null,
      metaId: String(payload.issue.user.id),
      organizationId: integration.organizationId,
    });
  }

  // Create thread for the issue
  // Store GitHub issue identifier in discordChannelId as "github:issue:123"
  const threadId = ulid().toLowerCase();
  await fetchClient.mutate.thread.insert({
    id: threadId,
    organizationId: integration.organizationId,
    name: payload.issue.title,
    createdAt: new Date(payload.issue.created_at),
    deletedAt: null,
    discordChannelId: `github:issue:${payload.issue.number}:${payload.repository.full_name}`,
    authorId: authorId,
    assignedUserId: null,
  });

  // Create initial message with issue body
  if (payload.issue.body) {
    await fetchClient.mutate.message.insert({
      id: ulid().toLowerCase(),
      threadId,
      authorId: authorId,
      content: JSON.stringify(parse(payload.issue.body)),
      createdAt: new Date(payload.issue.created_at),
      origin: "github",
      externalMessageId: String(payload.issue.id),
    });
  }

  console.debug(
    `Created thread ${threadId} for issue #${payload.issue.number}`
  );
});

// Handle new pull requests
webhooks.on("pull_request.opened", async ({ payload }) => {
  console.debug(
    `New PR: ${payload.pull_request.title} (#${payload.pull_request.number})`
  );

  const integration = findIntegration(
    String(payload.installation?.id ?? ""),
    payload.repository.full_name
  );

  if (!integration) {
    console.debug("No matching integration found");
    return;
  }

  const integrationSettings = safeParseIntegrationSettings(
    integration.configStr
  );
  if (!integrationSettings?.selectedEvents.includes("pull_request")) {
    console.debug("Pull request event not enabled for this integration");
    return;
  }

  // Get or create author
  let authorId = store.query.author
    .first({ metaId: String(payload.pull_request.user.id) })
    .get()?.id;

  if (!authorId) {
    authorId = ulid().toLowerCase();
    await fetchClient.mutate.author.insert({
      id: authorId,
      name: payload.pull_request.user.login,
      userId: null,
      metaId: String(payload.pull_request.user.id),
      organizationId: integration.organizationId,
    });
  }

  // Create thread for the PR
  // Store GitHub PR identifier in discordChannelId as "github:pr:123"
  const threadId = ulid().toLowerCase();
  await fetchClient.mutate.thread.insert({
    id: threadId,
    organizationId: integration.organizationId,
    name: payload.pull_request.title,
    createdAt: new Date(payload.pull_request.created_at),
    deletedAt: null,
    discordChannelId: `github:pr:${payload.pull_request.number}:${payload.repository.full_name}`,
    authorId: authorId,
    assignedUserId: null,
  });

  // Create initial message with PR body
  if (payload.pull_request.body) {
    await fetchClient.mutate.message.insert({
      id: ulid().toLowerCase(),
      threadId,
      authorId: authorId,
      content: JSON.stringify(parse(payload.pull_request.body)),
      createdAt: new Date(payload.pull_request.created_at),
      origin: "github",
      externalMessageId: String(payload.pull_request.id),
    });
  }

  console.debug(
    `Created thread ${threadId} for PR #${payload.pull_request.number}`
  );
});

// Error handling
webhooks.onError((error) => {
  console.error(error);
});

// Create HTTP server
const port = process.env.PORT ?? 3334;
const path = "/";
const middleware = createNodeMiddleware(webhooks, { path });

const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Handle webhooks - Pass to Octokit middleware which handles body parsing
  return middleware(req, res);
});

server.listen(port, () => {
  console.debug(`GitHub webhook server listening on port ${port}`);
  console.debug(`Webhook endpoint: http://localhost:${port}${path}`);
  console.debug(`Health check available at http://localhost:${port}/health`);
});
