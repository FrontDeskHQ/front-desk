import { createClient } from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import type { Router } from "api/router";
import { schema } from "api/schema";

console.info("Live State URL: ", process.env.DISCORD_BOT_KEY);

export const { client, store } = createClient<Router>({
  url: "ws://localhost:3333/api/ls/ws",
  schema,
  credentials: async () => ({
    discordBotKey: process.env.DISCORD_BOT_KEY ?? "",
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
  url: "http://localhost:3333/api/ls",
  schema,
  credentials: async () => ({
    "x-discord-bot-key": process.env.DISCORD_BOT_KEY ?? "",
  }),
});
