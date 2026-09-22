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
): boolean =>
  Boolean(secret) && headers[CAPABILITY_INVOKE_SECRET_HEADER] === secret;

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
        const result = await connector.invoke(parsed.data);
        set.status = result.status;
        return result.body;
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
        return connector.probe(parsed.data.config);
      }
    );
  }

  return app;
};
