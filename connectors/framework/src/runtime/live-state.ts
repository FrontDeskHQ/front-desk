import { createClient } from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import type { Router } from "api/router";
import { schema } from "api/schema";
import { z } from "zod";

const connectionTokenResponseSchema = z.object({
  token: z.string().min(1),
});

export interface CreateLiveStateClientOptions {
  /**
   * Value of the connector bot key (all connectors authenticate against the
   * shared `DISCORD_BOT_KEY` today — pass `process.env.DISCORD_BOT_KEY ?? ""`).
   */
  botKey: string;
  /** HTTP header used for ordinary fetches and the WS token exchange. */
  credentialHeader?: string;
  /** Override the WS url (defaults to `LIVE_STATE_WS_URL` / localhost). */
  wsUrl?: string;
  /** Override the fetch url (defaults to `LIVE_STATE_API_URL` / localhost). */
  apiUrl?: string;
  /** Label used in reconnect logging, e.g. `"Discord"`. */
  label?: string;
}

/**
 * Node-only live-state client bootstrap shared by every connector: the reactive
 * `client`/`store`, the one-shot `fetchClient`, reconnect logging, and the
 * initial organization load. The only thing that differs per connector is the
 * bot-key credential, which is parameterized.
 */
export const createLiveStateClient = (
  options: CreateLiveStateClientOptions
) => {
  const { botKey, credentialHeader = "x-discord-bot-key", label } = options;

  const prefix = label ? `[${label}] ` : "";
  const apiUrl =
    options.apiUrl ??
    process.env.LIVE_STATE_API_URL ??
    "http://localhost:3333/api/ls";

  const exchangeConnectionToken = async (): Promise<string> => {
    const response = await fetch(`${apiUrl}/connection-token`, {
      headers: { [credentialHeader]: botKey },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(
        `${prefix}Failed to exchange Live State connection token (${response.status})`
      );
    }

    const body = connectionTokenResponseSchema.safeParse(await response.json());
    if (!body.success) {
      throw new Error(`${prefix}Live State token exchange returned no token`);
    }

    return body.data.token;
  };

  const { client, store } = createClient<Router>({
    credentials: async () => ({ token: await exchangeConnectionToken() }),
    schema,
    storage: false,
    url:
      options.wsUrl ??
      process.env.LIVE_STATE_WS_URL ??
      "ws://localhost:3333/api/ls/ws",
  });

  client.ws.addEventListener("open", () => {
    console.info(`${prefix}Live State connected`);
  });

  client.ws.addEventListener("close", () => {
    console.info(`${prefix}Live State disconnected`);
  });

  client.ws.addEventListener("error", (error) => {
    console.error(`${prefix}Live State error:`, error, error.error);
  });

  client.load(store.query.organization.load().buildQueryRequest());

  const fetchClient = createFetchClient<Router>({
    credentials: async () => ({ [credentialHeader]: botKey }),
    schema,
    url: apiUrl,
  });

  return { client, fetchClient, store };
};

export type LiveStateClient = ReturnType<typeof createLiveStateClient>;
export type LiveStateStore = LiveStateClient["store"];
export type LiveStateFetchClient = LiveStateClient["fetchClient"];
