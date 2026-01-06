import { statusValues } from "@workspace/ui/components/indicator";
import { createServer } from "node:http";
import { App, createNodeMiddleware } from "octokit";
import { ulid } from "ulid";
import "./env";
import { fetchClient, store } from "./lib/live-state";

// TODO refactor this whole file to use a framework like express or elysia

const appId = process.env.GITHUB_APP_ID as string;
const privateKey = process.env.GITHUB_PRIVATE_KEY as string;
const secret = process.env.GITHUB_WEBHOOK_SECRET as string;
const oauthClientId = process.env.GITHUB_CLIENT_ID as string;
const oauthClientSecret = process.env.GITHUB_CLIENT_SECRET as string;

const app = new App({
  appId,
  privateKey,
  webhooks: { secret },
  oauth: {
    clientId: oauthClientId,
    clientSecret: oauthClientSecret,
  },
});

// API Functions to interact with GitHub

/**
 * Get an authenticated Octokit instance for a specific installation
 */
async function getOctokit(installationId: number) {
  return await app.getInstallationOctokit(installationId);
}

/**
 * Fetch open issues from a repository
 */
async function fetchIssues(
  installationId: number,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
) {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/issues", {
      owner,
      repo,
      state,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    return data;
  } catch (error) {
    console.error(`Error fetching issues:`, error);
    throw error;
  }
}

/**
 * Create an issue in a repository
 */
async function createIssue(
  installationId: number,
  owner: string,
  repo: string,
  title: string,
  body: string
) {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request(
      "POST /repos/{owner}/{repo}/issues",
      {
        owner,
        repo,
        title,
        body,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    return data;
  } catch (error) {
    console.error(`Error creating issue:`, error);
    throw error;
  }
}

/**
 * Fetch pull requests from a repository
 */
async function fetchPullRequests(
  installationId: number,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
) {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      state,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    return data;
  } catch (error) {
    console.error(`Error fetching pull requests:`, error);
    throw error;
  }
}

const STATUS_OPEN = 0;
const STATUS_RESOLVED = 2;
const STATUS_CLOSED = 3;

app.webhooks.on("issues.closed", async ({ payload }) => {
  try {
    const issueId = payload.issue.id.toString();
    const issueNumber = payload.issue.number;
    const repoFullName = payload.repository.full_name;

    console.log(
      `[GitHub] Issue closed: ${repoFullName}#${issueNumber} (ID: ${issueId})`
    );

    const linkedThreads = store.query.thread
      .where({ externalIssueId: issueId })
      .get();

    if (linkedThreads.length === 0) {
      console.log(`[GitHub] No threads linked to issue ${issueId}`);
      return;
    }

    for (const thread of linkedThreads) {
      if (thread.status === STATUS_CLOSED) {
        console.log(
          `[GitHub] Thread ${thread.id} is already closed, skipping status update`
        );
        continue;
      }

      const oldStatus = thread.status ?? STATUS_OPEN;
      const newStatus = STATUS_RESOLVED;

      console.log(
        `[GitHub] Updating thread ${thread.id} status from ${statusValues[oldStatus]?.label} to ${statusValues[newStatus]?.label}`
      );

      // Update thread status to Resolved
      store.mutate.thread.update(thread.id, {
        status: newStatus,
      });

      // Create an update record to track this change
      store.mutate.update.insert({
        id: ulid().toLowerCase(),
        threadId: thread.id,
        type: "status_changed",
        createdAt: new Date(),
        userId: null, // No user - this is a system action from GitHub
        metadataStr: JSON.stringify({
          oldStatus,
          newStatus,
          oldStatusLabel: statusValues[oldStatus]?.label,
          newStatusLabel: statusValues[newStatus]?.label,
          source: "github",
          issueNumber,
          repoFullName,
          userName: "GitHub Integration",
        }),
        // Mark as replicated from GitHub so it doesn't sync back
        replicatedStr: JSON.stringify({ github: true }),
      });
    }
  } catch (error) {
    console.error("[GitHub] Error handling issues.closed webhook:", error);
  }
});

app.webhooks.on("pull_request.closed", async ({ payload }) => {
  try {
    const prId = payload.pull_request.id.toString();
    const prNumber = payload.pull_request.number;
    const repoFullName = payload.repository.full_name;
    const merged = payload.pull_request.merged;

    console.log(
      `[GitHub] Pull request ${
        merged ? "merged" : "closed"
      }: ${repoFullName}#${prNumber} (ID: ${prId})`
    );

    const linkedThreads = store.query.thread
      .where({ externalPrId: prId })
      .get();

    if (linkedThreads.length === 0) {
      console.log(`[GitHub] No threads linked to PR ${prId}`);
      return;
    }

    for (const thread of linkedThreads) {
      if (thread.status === STATUS_CLOSED) {
        console.log(
          `[GitHub] Thread ${thread.id} is already closed, skipping status update`
        );
        continue;
      }

      const oldStatus = thread.status ?? STATUS_OPEN;
      const newStatus = STATUS_RESOLVED;

      console.log(
        `[GitHub] Updating thread ${thread.id} status from ${statusValues[oldStatus]?.label} to ${statusValues[newStatus]?.label}`
      );

      store.mutate.thread.update(thread.id, {
        status: newStatus,
      });

      store.mutate.update.insert({
        id: ulid().toLowerCase(),
        threadId: thread.id,
        type: "status_changed",
        createdAt: new Date(),
        userId: null,
        metadataStr: JSON.stringify({
          oldStatus,
          newStatus,
          oldStatusLabel: statusValues[oldStatus]?.label,
          newStatusLabel: statusValues[newStatus]?.label,
          source: "github",
          prNumber,
          repoFullName,
          merged,
          userName: "GitHub Integration",
        }),
        replicatedStr: JSON.stringify({ github: true }),
      });
    }
  } catch (error) {
    console.error(
      "[GitHub] Error handling pull_request.closed webhook:",
      error
    );
  }
});

// Log all received webhook events
app.webhooks.onAny(async ({ payload }) => {
  console.log("Received event:", payload);
});

// Handle webhook errors
app.webhooks.onError((error) => {
  console.error(error);
});

// Create server with custom routes
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);

  // API endpoint to fetch issues
  if (url.pathname === "/api/issues" && req.method === "GET") {
    const installationIdParam = url.searchParams.get("installation_id");
    const owner = url.searchParams.get("owner");
    const repo = url.searchParams.get("repo");
    const state =
      (url.searchParams.get("state") as "open" | "closed" | "all") || "open";

    if (!installationIdParam || !owner || !repo) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing installation_id, owner, or repo query parameters",
        })
      );
      return;
    }

    const installationId = Number.parseInt(installationIdParam, 10);
    if (Number.isNaN(installationId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid installation_id" }));
      return;
    }

    try {
      const issues = await fetchIssues(installationId, owner, repo, state);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ issues, count: issues.length }));
    } catch (error) {
      console.error("Error fetching issues:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to fetch issues" }));
    }
    return;
  }

  // API endpoint to create an issue
  if (url.pathname === "/api/issues" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    let parsedBody: {
      installation_id?: string;
      owner?: string;
      repo?: string;
      title?: string;
      body?: string;
    };

    try {
      parsedBody = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const {
      installation_id: installationIdParam,
      owner,
      repo,
      title,
      body: issueBody,
    } = parsedBody;

    if (!installationIdParam || !owner || !repo || !title) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            "Missing installation_id, owner, repo, or title in request body",
        })
      );
      return;
    }

    const installationId = Number.parseInt(installationIdParam, 10);
    if (Number.isNaN(installationId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid installation_id" }));
      return;
    }

    try {
      const issue = await createIssue(
        installationId,
        owner,
        repo,
        title,
        issueBody ?? ""
      );
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ issue }));
    } catch (error) {
      console.error("Error creating issue:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to create issue" }));
    }
    return;
  }

  // API endpoint to fetch pull requests
  if (url.pathname === "/api/pull-requests" && req.method === "GET") {
    const installationIdParam = url.searchParams.get("installation_id");
    const owner = url.searchParams.get("owner");
    const repo = url.searchParams.get("repo");
    const state =
      (url.searchParams.get("state") as "open" | "closed" | "all") || "open";

    if (!installationIdParam || !owner || !repo) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing installation_id, owner, or repo query parameters",
        })
      );
      return;
    }

    const installationId = Number.parseInt(installationIdParam, 10);
    if (Number.isNaN(installationId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid installation_id" }));
      return;
    }

    try {
      const pullRequests = await fetchPullRequests(
        installationId,
        owner,
        repo,
        state
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ pullRequests, count: pullRequests.length }));
    } catch (error) {
      console.error("Error fetching pull requests:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to fetch pull requests" }));
    }
    return;
  }

  // GitHub App installation callback endpoint - handles the callback after app installation
  if (url.pathname === "/api/github/setup" && req.method === "GET") {
    console.log("GitHub App installation callback endpoint hit");

    try {
      const installationIdParam = url.searchParams.get("installation_id");
      const setupAction = url.searchParams.get("setup_action");
      const state = url.searchParams.get("state");

      console.log("installation_id:", installationIdParam);
      console.log("setup_action:", setupAction);
      console.log("state:", state);

      if (!installationIdParam || !state) {
        res.writeHead(302, {
          Location: `${
            process.env.VITE_BASE_URL || "http://localhost:3000"
          }/app/settings/organization/integration/github?error=missing_params`,
        });
        res.end();
        return;
      }

      const installationId = Number.parseInt(installationIdParam, 10);

      if (Number.isNaN(installationId)) {
        res.writeHead(302, {
          Location: `${
            process.env.VITE_BASE_URL || "http://localhost:3000"
          }/app/settings/organization/integration/github?error=invalid_installation_id`,
        });
        res.end();
        return;
      }

      const [orgId, csrfToken] = state.split("_");

      if (!orgId || !csrfToken) {
        res.writeHead(302, {
          Location: `${
            process.env.VITE_BASE_URL || "http://localhost:3000"
          }/app/settings/organization/integration/github?error=invalid_state`,
        });
        res.end();
        return;
      }

      const integration = await fetchClient.query.integration
        .first({
          organizationId: orgId,
          type: "github",
        })
        .get();

      console.log("integration:", integration);

      if (!integration) {
        throw new Error("INTEGRATION_NOT_FOUND");
      }

      if (!integration.configStr) {
        throw new Error("INTEGRATION_CONFIG_NOT_FOUND");
      }

      const { csrfToken: csrfTokenFromConfig, ...config } = JSON.parse(
        integration.configStr
      );

      if (csrfTokenFromConfig !== csrfToken) {
        throw new Error("CSRF_TOKEN_MISMATCH");
      }

      // Get authenticated Octokit for this installation
      const octokit = await getOctokit(installationId);

      // Fetch repositories accessible to this installation
      const { data: reposData } = await octokit.request(
        "GET /installation/repositories",
        {
          per_page: 100,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      const repos = reposData.repositories.map((repo) => ({
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
      }));

      await fetchClient.mutate.integration.update(integration.id, {
        enabled: true,
        updatedAt: new Date(),
        configStr: JSON.stringify({
          ...config,
          installationId,
          repos,
        }),
      });

      // Redirect to frontend repository selection page
      res.writeHead(302, {
        Location: `${
          process.env.VITE_BASE_URL || "http://localhost:3000"
        }/app/settings/organization/integration/github`,
      });
      res.end();
      return;
    } catch (error) {
      console.error("[GitHub] Error handling installation callback:", error);
      res.writeHead(302, {
        Location: `${
          process.env.VITE_BASE_URL || "http://localhost:3000"
        }/app/settings/organization/integration/github?error=callback_error`,
      });
      res.end();
      return;
    }
  }

  // GitHub webhook handler
  const middleware = createNodeMiddleware(app);
  middleware(req, res);
});

server.listen(process.env.PORT || 3334, () => {
  console.log(`Server listening on port ${process.env.PORT || 3334}`);
  console.log(`API endpoints:`);
  console.log(
    `  GET /api/issues?installation_id=<id>&owner=<owner>&repo=<repo>&state=<open|closed|all>`
  );
  console.log(
    `  POST /api/issues { installation_id, owner, repo, title, body? }`
  );
  console.log(
    `  GET /api/pull-requests?installation_id=<id>&owner=<owner>&repo=<repo>&state=<open|closed|all>`
  );
  console.log(`  GET /api/github/setup (GitHub App installation callback)`);
});
