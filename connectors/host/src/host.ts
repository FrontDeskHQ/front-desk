import { createHash, timingSafeEqual } from "node:crypto";

import {
  CAPABILITY_INVOKE_PATH,
  CAPABILITY_INVOKE_SECRET_HEADER,
  CONNECTION_PROBE_PATH,
  invokeEnvelopeSchema,
  probeRequestSchema,
} from "@connectors/framework";
import Elysia from "elysia";
import { z } from "zod";

import {
  completeLinearOAuth,
  readLinearOAuthEnvironment,
} from "./linear-oauth";
import type { LinearOAuthEnvironment } from "./linear-oauth";

export interface HostedConnectorResult {
  body: unknown;
  status: number;
}

export interface HostedConnector {
  invoke(input: {
    capability: string;
    config: string | null;
    method: string;
    payload: unknown;
  }): Promise<HostedConnectorResult>;
  probe(config: string | null): Promise<{ configStr?: string; live: boolean }>;
  type: string;
}

interface ConnectorHostOptions {
  connectors: HostedConnector[];
  secret: string | undefined;
  fetcher?: typeof fetch;
  linearOAuthEnvironment?: LinearOAuthEnvironment;
}

const linearCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const authorized = (
  headers: Record<string, string | undefined>,
  secret: string | undefined
): boolean => {
  const provided = headers[CAPABILITY_INVOKE_SECRET_HEADER];
  if (!(provided && secret)) {
    return false;
  }
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(secret).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
};

export const createConnectorHost = ({
  connectors,
  secret,
  fetcher = fetch,
  linearOAuthEnvironment,
}: ConnectorHostOptions) => {
  const app = new Elysia().get("/health", () => ({ ok: true }));

  app.get("/linear/api/oauth/callback", async ({ query, set }) => {
    let environment: LinearOAuthEnvironment;
    try {
      environment = linearOAuthEnvironment ?? readLinearOAuthEnvironment();
    } catch (error) {
      console.error("[Linear] OAuth is not configured:", error);
      set.status = 503;
      return { error: "LINEAR_OAUTH_NOT_CONFIGURED" };
    }

    const parsed = linearCallbackQuerySchema.safeParse(query);
    const settingsUrl = `${environment.frontendBaseUrl}/app/settings/organization/integration/linear`;
    if (!parsed.success) {
      return Response.redirect(`${settingsUrl}?error=missing_params`, 302);
    }
    const separator = parsed.data.state.indexOf(".");
    const integrationId = parsed.data.state.slice(0, separator);
    const state = parsed.data.state.slice(separator + 1);
    if (separator < 1 || !state) {
      return Response.redirect(`${settingsUrl}?error=invalid_state`, 302);
    }

    try {
      await completeLinearOAuth(
        { code: parsed.data.code, integrationId, state },
        environment,
        fetcher
      );
      return Response.redirect(settingsUrl, 302);
    } catch (error) {
      console.error("[Linear] OAuth callback failed:", error);
      return Response.redirect(`${settingsUrl}?error=callback_error`, 302);
    }
  });

  for (const connector of connectors) {
    const prefix = `/${connector.type}`;
    app.post(
      `${prefix}${CAPABILITY_INVOKE_PATH}`,
      async ({ body, headers, set }) => {
        if (!authorized(headers, secret)) {
          set.status = 401;
          return { error: "UNAUTHORIZED" };
        }
        const parsed = invokeEnvelopeSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: "INVALID_INVOKE_ENVELOPE" };
        }
        try {
          const result = await connector.invoke(parsed.data);
          set.status = result.status;
          return result.body;
        } catch (error) {
          console.error("[connector-host] invoke failed", error);
          set.status = 500;
          return { error: "INVOKE_FAILED" };
        }
      }
    );
    app.post(
      `${prefix}${CONNECTION_PROBE_PATH}`,
      async ({ body, headers, set }) => {
        if (!authorized(headers, secret)) {
          set.status = 401;
          return { error: "UNAUTHORIZED" };
        }
        const parsed = probeRequestSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: "INVALID_PROBE_REQUEST" };
        }
        try {
          return await connector.probe(parsed.data.config);
        } catch (error) {
          console.error("[connector-host] probe failed", error);
          set.status = 500;
          return { error: "PROBE_FAILED" };
        }
      }
    );
  }

  return app;
};
