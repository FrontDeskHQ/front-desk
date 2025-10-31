import "./env";

import { expressAdapter, server, SQLStorage } from "@live-state/sync/server";
import expressWs from "@wll8/express-ws";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import process from "node:process";
import { Pool } from "pg";
import { auth } from "./lib/auth";
import { router } from "./live-state/router";
import { schema } from "./live-state/schema";

const { app } = expressWs(express());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000", // Allow specified origin or default to localhost:3000
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Allow cookies to be sent with requests
};

// Apply CORS middleware
app.use(cors(corsOptions));

const lsServer = server({
  router,
  storage: new SQLStorage(
    new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  ),
  schema,
  contextProvider: async ({ transport, headers, queryParams }) => {
    if (transport === "WEBSOCKET") {
      if (queryParams.discordBotKey) {
        const botKey = queryParams.discordBotKey;

        if (botKey !== process.env.DISCORD_BOT_KEY) return;

        return {
          apiKey: botKey,
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
        apiKey: botKey,
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

export const db = lsServer.storage;

app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

expressAdapter(app as any, lsServer, {
  basePath: "/api/ls",
});

app.listen(process.env.PORT || 3333, () => {
  console.log(`Server running on port ${process.env.PORT || 3333}`);
});
