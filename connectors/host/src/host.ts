import { createHash, timingSafeEqual } from "node:crypto";

import {
  CAPABILITY_INVOKE_PATH,
  CAPABILITY_INVOKE_SECRET_HEADER,
  CONNECTION_PROBE_PATH,
  invokeEnvelopeSchema,
  probeRequestSchema,
} from "@connectors/framework";
import Elysia from "elysia";
import type { AnyElysia } from "elysia";

import type { HostedConnector, HostedConnectorProvider } from "./provider";

export type {
  HostedConnector,
  HostedConnectorProvider,
  HostedConnectorResult,
} from "./provider";

interface ConnectorHostOptions {
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

export const createConnectorHost = ({
  providers,
  secret,
}: ConnectorHostOptions): ConnectorHost => {
  const app = new Elysia().get("/health", () => ({ ok: true }));

  for (const provider of providers) {
    provider.registerRoutes(app);
    registerConnectorRoutes(app, provider.connector, secret);
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
