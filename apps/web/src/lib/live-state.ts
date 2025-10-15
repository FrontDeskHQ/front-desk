import { createClient } from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { Router } from "api/router";
import { schema } from "api/schema";
import { authClient } from "./auth-client";

const { client, store } = createClient<Router>({
  url: "ws://localhost:3333/api/ls/ws",
  schema,
  credentials: async () => ({
    token: (await authClient.oneTimeToken.generate()).data?.token ?? "",
  }),
  storage: {
    name: "frontdesk",
  },
});

const { query, mutate } = store;

export { client, mutate, query };

export const fetchClient = createFetchClient<Router>({
  url:
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000/api/ls"
      : "http://localhost:3333/api/ls",
  schema,
  credentials: createIsomorphicFn()
    .server(() => Object.fromEntries(getRequestHeaders()))
    .client(() => ({})),
});
