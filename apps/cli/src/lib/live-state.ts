import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import type { Router } from "api/router";
import { schema } from "api/schema";
import { getApiUrl, getDiscordBotKey } from "./env.js";

export const fetchClient = createFetchClient<Router>({
  url: getApiUrl(),
  schema,
  credentials: async () => ({
    "x-discord-bot-key": getDiscordBotKey(),
  }),
});
