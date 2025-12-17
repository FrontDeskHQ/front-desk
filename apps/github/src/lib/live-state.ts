import { createClient } from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import type { Router } from "api/router";
import { schema } from "api/schema";

export const { client, store } = createClient<Router>({
  url: process.env.LIVE_STATE_WS_URL || "ws://localhost:3333/api/ls/ws",
  schema,
  credentials: async () => ({
    githubBotKey: process.env.GITHUB_BOT_KEY ?? "",
  }),
  storage: false,
});

client.ws.addEventListener("open", () => {
  console.info("Live State connected");
});

client.ws.addEventListener("close", () => {
  console.info("Live State disconnected");
});

client.ws.addEventListener("error", (error) => {
  console.error("Live State error: ", error, error.error);
});

client.subscribe();

export const fetchClient = createFetchClient<Router>({
  url: process.env.LIVE_STATE_API_URL || "http://localhost:3333/api/ls",
  schema,
  credentials: async () => ({
    "x-github-bot-key": process.env.GITHUB_BOT_KEY ?? "",
  }),
});
