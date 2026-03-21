import {
  createClient,
  defineOptimisticMutations,
} from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { Router } from "api/router";
import { schema } from "api/schema";
import { ulid } from "ulid";
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
  optimisticMutations: defineOptimisticMutations<Router, typeof schema>({
    message: {
      create: ({ input, storage }) => {
        const author =
          storage.author
            .where({
              userId: input.userId,
              organizationId: input.organizationId,
            })
            .get()[0] ?? null;

        let authorId = author?.id;

        if (!authorId) {
          authorId = ulid().toLowerCase();

          storage.author.insert({
            id: authorId,
            userId: input.userId,
            organizationId: input.organizationId,
            name: input.userName ?? "",
          });
        }

        storage.message.insert({
          id: ulid().toLowerCase(),
          authorId: authorId,
          content: JSON.stringify(input.content),
          threadId: input.threadId,
          createdAt: new Date(),
        });
      },
    },
  }),
});

const { query, mutate } = store;

export { client, mutate, query };

// Check this setup when it's deployed
export const fetchClient = createFetchClient<Router>({
  url: getLiveStateApiUrl(),
  schema,
  credentials: createIsomorphicFn()
    .server(() => Object.fromEntries(getRequestHeaders()))
    .client(() => ({})),
});
