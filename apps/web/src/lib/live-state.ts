import { createClient } from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { Router } from "api/router";
import { schema } from "api/schema";
import { authClient } from "./auth-client";
import { getLiveStateApiUrl } from "./urls";

const { client, store } = createClient<Router>({
  url:
    import.meta.env.VITE_LIVE_STATE_WS_URL ?? "ws://localhost:3333/api/ls/ws",
  schema,
  credentials: async () => ({
    token: (await authClient.oneTimeToken.generate()).data?.token ?? "",
  }),
  storage: {
    name: "frontdesk",
  },
  connection: {
    autoConnect: false,
  },
});

const { query, mutate } = store;

export { client, mutate, query };

export const fetchClient = createFetchClient<Router>({
  url: "/api/ls",
  schema,
  credentials: createIsomorphicFn()
    .server(() => Object.fromEntries(getRequestHeaders()))
    .client(() => ({})),
});
