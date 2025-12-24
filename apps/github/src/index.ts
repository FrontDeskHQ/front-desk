import fs from "node:fs";
import { createServer } from "node:http";
import { App, createNodeMiddleware } from "octokit";
import "./env";

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

// Handle OAuth token creation
app.oauth.on("token.created", async ({ token }) => {
  console.log("OAuth token created successfully", token);
});

const INSTALLATION_ID = 100205660;

// Create server with custom routes
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);

  // API endpoint to fetch issues
  if (url.pathname === "/api/issues" && req.method === "GET") {
    const owner = url.searchParams.get("owner");
    const repo = url.searchParams.get("repo");
    const state =
      (url.searchParams.get("state") as "open" | "closed" | "all") || "open";

    if (!owner || !repo) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Missing owner or repo query parameters" }),
      );
      return;
    }

    try {
      const issues = await fetchIssues(INSTALLATION_ID, owner, repo, state);
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
    const owner = url.searchParams.get("owner");
    const repo = url.searchParams.get("repo");
    const state =
      (url.searchParams.get("state") as "open" | "closed" | "all") || "open";

    if (!owner || !repo) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Missing owner or repo query parameters" }),
      );
      return;
    }

    try {
      const pullRequests = await fetchPullRequests(
        INSTALLATION_ID,
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

  // GitHub OAuth callback endpoint - handles the OAuth callback from GitHub
  if (url.pathname === "/api/github/oauth/callback" && req.method === "GET") {
    try {
      const { code, state } = Object.fromEntries(url.searchParams);

      if (!code || !state) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=missing_params`,
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

      // Exchange code for access token
      const tokenResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
          }),
        },
      );

      const tokenData = (await tokenResponse.json()) as {
        error?: string;
        error_description?: string;
        access_token?: string;
      };

      if (tokenData.error || !tokenData.access_token) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=token_exchange_failed`,
        });
        res.end();
        return;
      }

      const { access_token } = tokenData;

      // Fetch user's repositories
      const reposResponse = await fetch(
        "https://api.github.com/user/repos?per_page=100&sort=updated",
        {
          headers: {
            Authorization: `token ${access_token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!reposResponse.ok) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=failed_to_fetch_repos`,
        });
        res.end();
        return;
      }

      const repos = (await reposResponse.json()) as Array<{
        full_name: string;
        owner: { login: string };
        name: string;
      }>;

      // Call the main API server to update the integration using Live State
      const apiUrl =
        process.env.LIVE_STATE_API_URL || "http://localhost:3333/api/ls";
      const githubBotKey = process.env.GITHUB_BOT_KEY;

      if (!githubBotKey) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=bot_key_not_configured`,
        });
        res.end();
        return;
      }

      // First, get the current integration to verify CSRF and get current config
      // Using Live State query endpoint
      const getIntegrationResponse = await fetch(
        `${apiUrl}/query/integration?where[organizationId]=${orgId}&where[type]=github`,
        {
          headers: {
            "x-github-bot-key": githubBotKey,
          },
        },
      );

      if (!getIntegrationResponse.ok) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=integration_not_found`,
        });
        res.end();
        return;
      }

      const integrationsData = (await getIntegrationResponse.json()) as {
        data?: Array<{ id: string; configStr: string | null }>;
      };

      const integration = integrationsData.data?.[0];

      if (!integration || !integration.configStr) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=config_not_found`,
        });
        res.end();
        return;
      }

      const config = JSON.parse(integration.configStr) as {
        csrfToken?: string;
        [key: string]: unknown;
      };

      if (config.csrfToken !== csrfToken) {
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=csrf_mismatch`,
        });
        res.end();
        return;
      }

      // Update integration with repositories using Live State mutation endpoint
      // The mutation endpoint format is: POST /api/ls/mutate/{collection}/{mutationName}
      const updateResponse = await fetch(
        `${apiUrl}/mutate/integration/update`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-github-bot-key": githubBotKey,
          },
          body: JSON.stringify({
            id: integration.id,
            configStr: JSON.stringify({
              ...config,
              accessToken: access_token, // Temporary, will be cleared after repo selection
              pendingRepos: repos.map((repo) => ({
                fullName: repo.full_name,
                owner: repo.owner.login,
                name: repo.name,
              })),
            }),
            updatedAt: new Date().toISOString(),
          }),
        },
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("[GitHub] Failed to update integration:", errorText);
        res.writeHead(302, {
          Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=update_failed`,
        });
        res.end();
        return;
      }

      // Redirect to frontend repository selection page
      res.writeHead(302, {
        Location: `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github/select-repo`,
      });
      res.end();
      return;
    } catch (error) {
      console.error("[GitHub] Error handling OAuth callback:", error);
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
    `  GET /api/issues?owner=<owner>&repo=<repo>&state=<open|closed|all>`,
  );
  console.log(
    `  GET /api/pull-requests?owner=<owner>&repo=<repo>&state=<open|closed|all>`,
  );
});
