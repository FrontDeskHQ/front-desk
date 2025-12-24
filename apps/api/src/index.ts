import "./env";

import "./lib/api-key";

import { Webhooks } from "@dodopayments/express";
import { expressAdapter, server } from "@live-state/sync/server";
import expressWs from "@wll8/express-ws";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import process from "node:process";
import { publicKeys } from "./lib/api-key";
import { auth } from "./lib/auth";
import { portalAuth } from "./lib/portal-auth";
import { router } from "./live-state/router";
import { schema } from "./live-state/schema";
import { storage } from "./live-state/storage";

const { app } = expressWs(express());

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "x-public-api-key"],
  credentials: true,
};

app.use(cors(corsOptions));

const lsServer = server({
  router,
  storage,
  schema,
  contextProvider: async ({ transport, headers, queryParams }) => {
    if (transport === "WEBSOCKET") {
      if (queryParams.discordBotKey) {
        const botKey = queryParams.discordBotKey;

        if (botKey !== process.env.DISCORD_BOT_KEY) return;

        return {
          internalApiKey: botKey,
        };
      }

      if (queryParams.githubBotKey) {
        const botKey = queryParams.githubBotKey;

        if (botKey !== process.env.GITHUB_BOT_KEY) return;

        return {
          internalApiKey: botKey,
        };
      }

      if (queryParams.publicApiKey) {
        const result = await publicKeys.verify(queryParams.publicApiKey);

        if (!result.valid) throw new Error("Invalid public API key");

        return {
          publicApiKey: result.record?.metadata,
        };
      }

      if (!queryParams.token) return;

      return {
        ...(await auth.api.verifyOneTimeToken({
          body: {
            token: queryParams.token,
          },
        })),
      };
    }

    if (headers["x-discord-bot-key"]) {
      const botKey = headers["x-discord-bot-key"];

      if (botKey !== process.env.DISCORD_BOT_KEY) return;

      return {
        internalApiKey: botKey,
      };
    }

    if (headers["x-github-bot-key"]) {
      const botKey = headers["x-github-bot-key"];

      if (botKey !== process.env.GITHUB_BOT_KEY) return;

      return {
        internalApiKey: botKey,
      };
    }

    if (headers["x-public-api-key"]) {
      const result = await publicKeys.verify(headers["x-public-api-key"]);

      if (!result.valid) throw new Error("Invalid public API key");

      return {
        publicApiKey: result.record?.metadata,
      };
    }

    const headersParse = new Headers(headers);

    const [session, portalSession] = await Promise.all([
      auth.api
        .getSession({
          headers: headersParse,
        })
        .catch(() => null),
      portalAuth.api
        .getSession({
          headers: headersParse,
        })
        .catch(() => null),
    ]);

    return {
      ...session,
      portalSession,
    };
  },
});

app.all("/api/auth/*", toNodeHandler(auth));

app.all("/api/portal-auth/*", toNodeHandler(portalAuth));

app.use(express.json());

// GitHub OAuth token exchange endpoint
app.post("/api/github/oauth/token", async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(500).json({ error: "GitHub OAuth not configured" });
  }

  try {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );

    const data = (await response.json()) as {
      error?: string;
      error_description?: string;
      access_token?: string;
    };

    if (data.error) {
      return res.status(400).json({ error: data.error_description });
    }

    return res.json({ access_token: data.access_token });
  } catch (error) {
    console.error("Error exchanging GitHub code:", error);
    return res.status(500).json({ error: "Failed to exchange code" });
  }
});

// GitHub OAuth callback endpoint - handles the OAuth callback from GitHub
app.get("/api/github/oauth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (
      !code ||
      !state ||
      typeof code !== "string" ||
      typeof state !== "string"
    ) {
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=missing_params`,
      );
    }

    const [orgId, csrfToken] = state.split("_");

    if (!orgId || !csrfToken) {
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=invalid_state`,
      );
    }

    // Get integration from database
    const integrations = Object.values(
      await storage.find(schema.integration, {
        where: {
          organizationId: orgId,
          type: "github",
        },
      }),
    );

    const integration = integrations[0];

    if (!integration) {
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=integration_not_found`,
      );
    }

    if (!integration.configStr) {
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=config_not_found`,
      );
    }

    const config = JSON.parse(integration.configStr);
    const { csrfToken: csrfTokenFromConfig } = config;

    if (csrfTokenFromConfig !== csrfToken) {
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=csrf_mismatch`,
      );
    }

    // Exchange code for access token
    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
    const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=oauth_not_configured`,
      );
    }

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );

    const tokenData = (await tokenResponse.json()) as {
      error?: string;
      error_description?: string;
      access_token?: string;
    };

    if (tokenData.error) {
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=token_exchange_failed`,
      );
    }

    const { access_token } = tokenData;

    if (!access_token) {
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=no_access_token`,
      );
    }

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
      return res.redirect(
        `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=failed_to_fetch_repos`,
      );
    }

    const repos = (await reposResponse.json()) as Array<{
      full_name: string;
      owner: { login: string };
      name: string;
    }>;

    // Store access token temporarily and redirect to repository selection
    await storage.update(schema.integration, integration.id, {
      configStr: JSON.stringify({
        ...config,
        accessToken: access_token, // Temporary, will be cleared after repo selection
        pendingRepos: repos.map((repo) => ({
          fullName: repo.full_name,
          owner: repo.owner.login,
          name: repo.name,
        })),
      }),
      updatedAt: new Date(),
    });

    // Redirect to frontend repository selection page
    return res.redirect(
      `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github/select-repo`,
    );
  } catch (error) {
    console.error("[GitHub] Error handling OAuth callback:", error);
    return res.redirect(
      `${process.env.VITE_BASE_URL || "http://localhost:3000"}/app/settings/organization/integration/github?error=callback_error`,
    );
  }
});

process.env.DODO_PAYMENTS_WEBHOOK_KEY &&
  app.post(
    "/api/webhook",
    Webhooks({
      webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY as string,
      onSubscriptionActive: async (payload) => {
        const subscription = Object.values(
          await storage.find(schema.subscription, {
            where: {
              customerId: payload.data.customer.customer_id,
            },
          }),
        )?.[0];

        if (!subscription) return;

        const plan =
          payload.data.product_id ===
          process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID
            ? "starter"
            : payload.data.product_id ===
                process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
              ? "pro"
              : null;

        if (!plan) return;

        await storage.update(schema.subscription, subscription.id, {
          plan: plan,
          status: "active",
          updatedAt: new Date(),
          subscriptionId: payload.data.subscription_id,
          seats: payload.data.quantity ?? 1,
        });
      },
      onSubscriptionExpired: async (payload) => {
        const subscription = Object.values(
          await storage.find(schema.subscription, {
            where: {
              customerId: payload.data.customer.customer_id,
            },
          }),
        )?.[0];
        if (!subscription) return;

        await storage.update(schema.subscription, subscription.id, {
          status: "expired",
          updatedAt: new Date(),
        });
      },
      onSubscriptionPlanChanged: async (payload) => {
        const subscription = Object.values(
          await storage.find(schema.subscription, {
            where: {
              customerId: payload.data.customer.customer_id,
            },
          }),
        )?.[0];

        if (!subscription) return;

        const plan =
          payload.data.product_id ===
          process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID
            ? "starter"
            : payload.data.product_id ===
                process.env.DODO_PAYMENTS_PRO_PRODUCT_ID
              ? "pro"
              : null;

        if (!plan) return;

        await storage.update(schema.subscription, subscription.id, {
          status: payload.data.status,
          plan: plan,
          seats: payload.data.quantity ?? 1,
          updatedAt: new Date(),
          subscriptionId: payload.data.subscription_id,
        });
      },
      onSubscriptionCancelled: async (payload) => {
        const subscription = Object.values(
          await storage.find(schema.subscription, {
            where: {
              customerId: payload.data.customer.customer_id,
            },
          }),
        )?.[0];
        if (!subscription) return;

        await storage.update(schema.subscription, subscription.id, {
          status: "cancelled",
          updatedAt: new Date(),
        });
      },
    }),
  );

expressAdapter(app as any, lsServer, {
  basePath: "/api/ls",
});

app.listen(process.env.PORT || 3333, () => {
  console.log(`Server running on port ${process.env.PORT || 3333}`);
});
