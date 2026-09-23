import { createHash, timingSafeEqual } from "node:crypto";

import {
  CAPABILITY_INVOKE_PATH,
  CAPABILITY_INVOKE_SECRET_HEADER,
  CONNECTION_PROBE_PATH,
  invokeEnvelopeSchema,
  probeRequestSchema,
} from "@connectors/framework";
import Elysia from "elysia";

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

export const createConnectorHost = ({
  connectors,
  secret,
}: ConnectorHostOptions) => {
  const app = new Elysia().get("/health", () => ({ ok: true }));

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
