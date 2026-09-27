import type { AnyElysia } from "elysia";

export interface HostedConnectorResult {
  body: unknown;
  status: number;
}

/** The capability and connection-probe adapter exposed by a hosted provider. */
export interface HostedConnector {
  invoke(input: {
    capability: string;
    config: string | null;
    integrationId?: string;
    method: string;
    payload: unknown;
  }): Promise<HostedConnectorResult>;
  probe(
    config: string | null,
    integrationId?: string
  ): Promise<{ configStr?: string; live: boolean }>;
  type: string;
}

/**
 * A provider module mounted into the shared connector host.
 *
 * The connector handles generic capability traffic. The provider owns any
 * provider-specific routes and background work that share the same process.
 */
export interface HostedConnectorProvider {
  connector: HostedConnector;
  registerRoutes(app: AnyElysia): void;
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
}
