import fs from "node:fs";
import { createServer } from "node:http";
import { App, createNodeMiddleware } from "octokit";
import "./env";
import { fetchClient } from "./lib/live-state";

// Get and validate required environment variables
const requiredEnvVars = [
  "GITHUB_APP_ID",
  "PRIVATE_KEY_PATH",
  "GITHUB_WEBHOOK_SECRET",
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

const app = new App({
  appId,
  privateKey,
  webhooks: { secret },
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
  state: "open" | "closed" | "all" = "open",
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
 * Fetch pull requests from a repository
 */
async function fetchPullRequests(
  installationId: number,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
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
        }),
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
        }),
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
        state,
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
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=missing_params`,
        });
        res.end();
        return;
      }

      const installationId = Number.parseInt(installationIdParam, 10);

      if (Number.isNaN(installationId)) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=invalid_installation_id`,
        });
        res.end();
        return;
      }

      const [orgId, csrfToken] = state.split("_");

      if (!orgId || !csrfToken) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=invalid_state`,
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
        integration.configStr,
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
        },
      );

      const repos = reposData.repositories.map((repo) => ({
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
      }));

      console.log("Available repositories:", repos.length);

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
        Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github`,
      });
      res.end();
      return;
    } catch (error) {
      console.error("[GitHub] Error handling installation callback:", error);
      res.writeHead(302, {
        Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=callback_error`,
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
    `  GET /api/issues?installation_id=<id>&owner=<owner>&repo=<repo>&state=<open|closed|all>`,
  );
  console.log(
    `  GET /api/pull-requests?installation_id=<id>&owner=<owner>&repo=<repo>&state=<open|closed|all>`,
  );
  console.log(`  GET /api/github/setup (GitHub App installation callback)`);
});
