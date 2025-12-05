import "./env";

import "./lib/api-key";

import { Webhooks } from "@dodopayments/express";
import { expressAdapter, server } from "@live-state/sync/server";
import expressWs from "@wll8/express-ws";
import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import process from "node:process";
import { publicKeys } from "./lib/api-key";
import {
  auth,
  bindSessionToOrg,
  getOrgBoundSession,
  supportAuth,
  unbindSessionFromOrg,
} from "./lib/auth";
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

    if (headers["x-public-api-key"]) {
      const result = await publicKeys.verify(headers["x-public-api-key"]);

      if (!result.valid) throw new Error("Invalid public API key");

      return {
        publicApiKey: result.record?.metadata,
      };
    }

    const session = await auth.api.getSession({
      headers: new Headers(headers),
    });

    return {
      ...session,
    };
  },
});

app.all("/api/auth/*", toNodeHandler(auth));

// Support portal auth - single OAuth callback for all orgs
app.all("/api/support-auth/*", toNodeHandler(supportAuth));

// Middleware for parsing cookies and JSON bodies
app.use(cookieParser());
app.use(express.json());

// Org-scoped session management endpoints
// These endpoints manage per-org session binding for support portal isolation
app.post("/api/support-session/bind", bindSessionToOrg);
app.get("/api/support-session/check", getOrgBoundSession);
app.post("/api/support-session/unbind", unbindSessionFromOrg);

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
          })
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
          seats:
            payload.data.addons?.find(
              (addon) =>
                addon.addon_id ===
                (plan === "starter"
                  ? process.env.DODO_PAYMENTS_STARTER_SEATS_ADDON_ID
                  : process.env.DODO_PAYMENTS_PRO_SEATS_ADDON_ID)
            )?.quantity ?? 1,
        });
      },
      onSubscriptionExpired: async (payload) => {
        const subscription = Object.values(
          await storage.find(schema.subscription, {
            where: {
              customerId: payload.data.customer.customer_id,
            },
          })
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
          })
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
          seats:
            payload.data.addons?.find(
              (addon) =>
                addon.addon_id ===
                (plan === "starter"
                  ? process.env.DODO_PAYMENTS_STARTER_SEATS_ADDON_ID
                  : process.env.DODO_PAYMENTS_PRO_SEATS_ADDON_ID)
            )?.quantity ?? 1,
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
          })
        )?.[0];
        if (!subscription) return;

        await storage.update(schema.subscription, subscription.id, {
          status: "cancelled",
          updatedAt: new Date(),
        });
      },
    })
  );

expressAdapter(app as any, lsServer, {
  basePath: "/api/ls",
});

app.listen(process.env.PORT || 3333, () => {
  console.log(`Server running on port ${process.env.PORT || 3333}`);
});
