import { createHash, timingSafeEqual } from "node:crypto";

import {
  AUTHORIZATION_CALLBACK_PATH,
  AUTHORIZATION_REVOKE_PATH,
  AUTHORIZATION_URL_PATH,
  authorizationRevokeRequestSchema,
  authorizationUrlRequestSchema,
  CAPABILITY_INVOKE_PATH,
  CAPABILITY_INVOKE_SECRET_HEADER,
  CONNECTION_PROBE_PATH,
  decodeAuthorizationState,
  invokeEnvelopeSchema,
  probeRequestSchema,
} from "@connectors/framework";
import Elysia from "elysia";
import type { AnyElysia } from "elysia";
import { z } from "zod";

import type {
  AuthorizationCore,
  HostedAuthorization,
  HostedConnector,
  HostedConnectorProvider,
} from "./provider";

export type {
  AuthorizationCore,
  HostedAuthorization,
  HostedConnector,
  HostedConnectorProvider,
  HostedConnectorResult,
} from "./provider";

interface ConnectorHostOptions {
  /** Required for providers whose connector implements authorization. */
  authorizationCore?: AuthorizationCore;
  providers: HostedConnectorProvider[];
  secret: string | undefined;
}

export interface ConnectorHost {
  app: AnyElysia;
  start(): Promise<void>;
  stop(): Promise<void>;
}

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

const registerConnectorRoutes = (
  app: AnyElysia,
  connector: HostedConnector,
  secret: string | undefined
) => {
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
        return await connector.probe(
          parsed.data.config,
          parsed.data.integrationId
        );
      } catch (error) {
        console.error("[connector-host] probe failed", error);
        set.status = 500;
        return { error: "PROBE_FAILED" };
      }
    }
  );
};

const callbackQuerySchema = z
  .object({
    code: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
    state: z.string().min(1),
  })
  .refine(({ code, error }) => Boolean(code) !== Boolean(error));

const registerAuthorizationRoutes = (
  app: AnyElysia,
  type: string,
  authorization: HostedAuthorization,
  core: AuthorizationCore | undefined,
  secret: string | undefined
) => {
  const prefix = `/${type}`;
  app.post(`${prefix}${AUTHORIZATION_URL_PATH}`, ({ body, headers, set }) => {
    if (!authorized(headers, secret)) {
      set.status = 401;
      return { error: "UNAUTHORIZED" };
    }
    const parsed = authorizationUrlRequestSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: "INVALID_AUTHORIZATION_REQUEST" };
    }
    try {
      return {
        url: authorization.authorizeUrl({
          config: parsed.data.config,
          integrationId: parsed.data.integrationId,
          state: parsed.data.state,
        }),
      };
    } catch (error) {
      console.error(`[connector-host] ${type} authorize URL failed`, error);
      set.status = 503;
      return { error: "AUTHORIZATION_NOT_CONFIGURED" };
    }
  });

  app.post(
    `${prefix}${AUTHORIZATION_REVOKE_PATH}`,
    async ({ body, headers, set }) => {
      if (!authorized(headers, secret)) {
        set.status = 401;
        return { error: "UNAUTHORIZED" };
      }
      const parsed = authorizationRevokeRequestSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: "INVALID_REVOKE_REQUEST" };
      }
      try {
        return await authorization.revoke({
          integrationId: parsed.data.integrationId,
        });
      } catch (error) {
        console.error(`[connector-host] ${type} revoke failed`, error);
        set.status = 503;
        return { error: "AUTHORIZATION_REVOKE_FAILED" };
      }
    }
  );

  app.get(`${prefix}${AUTHORIZATION_CALLBACK_PATH}`, async ({ query, set }) => {
    if (!core) {
      set.status = 503;
      return { error: "AUTHORIZATION_NOT_CONFIGURED" };
    }
    const settingsUrl = `${core.frontendBaseUrl}/app/settings/organization/integration/${type}`;
    const parsed = callbackQuerySchema.safeParse(query);
    if (!parsed.success) {
      return Response.redirect(`${settingsUrl}?error=missing_params`, 302);
    }
    const state = decodeAuthorizationState(parsed.data.state);
    if (!state || state.connectorType !== type) {
      return Response.redirect(`${settingsUrl}?error=invalid_state`, 302);
    }
    if (parsed.data.error) {
      const providerErrorQuery = new URLSearchParams({
        error: parsed.data.error,
      });
      return Response.redirect(`${settingsUrl}?${providerErrorQuery}`, 302);
    }
    if (!parsed.data.code) {
      return Response.redirect(`${settingsUrl}?error=missing_params`, 302);
    }

    try {
      const config = await core.readConfig(state.integrationId);
      const { configPatch, credential } = await authorization.complete({
        code: parsed.data.code,
        config,
        integrationId: state.integrationId,
      });
      await core.complete({
        connectorType: type,
        configPatch,
        credential,
        integrationId: state.integrationId,
        state: state.nonce,
      });
    } catch (error) {
      console.error(`[connector-host] ${type} authorization failed`, error);
      return Response.redirect(`${settingsUrl}?error=callback_error`, 302);
    }
    try {
      authorization.onCompleted?.(state.integrationId);
    } catch (error) {
      console.error(
        `[connector-host] ${type} post-authorization hook failed`,
        error
      );
    }
    return Response.redirect(settingsUrl, 302);
  });
};

export const createConnectorHost = ({
  authorizationCore,
  providers,
  secret,
}: ConnectorHostOptions): ConnectorHost => {
  const app = new Elysia().get("/health", () => ({ ok: true }));

  for (const provider of providers) {
    provider.registerRoutes(app);
    registerConnectorRoutes(app, provider.connector, secret);
    if (provider.connector.authorization) {
      registerAuthorizationRoutes(
        app,
        provider.connector.type,
        provider.connector.authorization,
        authorizationCore,
        secret
      );
    }
  }

  let started = false;
  let shutdownStarted = false;
  let stopped = false;
  let startPromise: Promise<void> | undefined;
  let stopPromise: Promise<void> | undefined;
  const startedProviders = new Set<HostedConnectorProvider>();
  const stoppedProviders = new Set<HostedConnectorProvider>();

  return {
    app,
    start: () => {
      if (started || shutdownStarted) return Promise.resolve();
      if (startPromise) return startPromise;
      if (stopPromise) return stopPromise;

      startPromise = (async () => {
        const pendingProviders = providers.filter(
          (provider) => !startedProviders.has(provider)
        );
        const results = await Promise.allSettled(
          pendingProviders.map(async (provider) => {
            await provider.start?.();
            startedProviders.add(provider);
          })
        );
        for (const result of results) {
          if (result.status === "rejected") {
            throw result.reason;
          }
        }
        started = true;
      })().finally(() => {
        startPromise = undefined;
      });
      return startPromise;
    },
    stop: () => {
      if (stopped) return Promise.resolve();
      if (stopPromise) return stopPromise;
      shutdownStarted = true;

      stopPromise = (async () => {
        if (startPromise) {
          try {
            await startPromise;
          } catch {
            // A failed startup can still leave a provider with resources to close.
          }
        }

        const pendingProviders = providers.filter(
          (provider) => !stoppedProviders.has(provider)
        );
        await Promise.all(
          pendingProviders.map(async (provider) => {
            await provider.stop?.();
            stoppedProviders.add(provider);
          })
        );
        stopped = true;
      })().finally(() => {
        stopPromise = undefined;
      });
      return stopPromise;
    },
  };
};
