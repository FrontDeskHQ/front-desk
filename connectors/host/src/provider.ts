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
  /** Present when the connector's manifest declares `supportsAuthorization`. */
  authorization?: HostedAuthorization;
  type: string;
}

/**
 * The connector's half of the authorization lifecycle (ADR-0024). The host
 * owns the routes, state round-trip and hand-off to core; this adapter owns
 * everything that depends on what the credential is.
 */
export interface HostedAuthorization {
  /** URL the owner's browser visits; `state` must round-trip untouched. */
  authorizeUrl(input: {
    config: string | null;
    integrationId: string;
    state: string;
  }): string;
  /**
   * Exchange the callback code for a credential plus the config it implies.
   * `config` is the integration's current `configStr`.
   */
  complete(input: {
    code: string;
    config: string | null;
    integrationId: string;
  }): Promise<{ configPatch: Record<string, unknown>; credential: unknown }>;
  /** Called after core has stored the credential. */
  onCompleted?(integrationId: string): void;
  /** Revoke upstream. An already-revoked authorization is not a failure. */
  revoke(input: { integrationId: string }): Promise<{
    alreadyRevoked?: boolean;
  }>;
}

/** Core-side operations the host needs to finish a handshake. */
export interface AuthorizationCore {
  complete(input: {
    connectorType: string;
    configPatch: Record<string, unknown>;
    credential: unknown;
    integrationId: string;
    state: string;
  }): Promise<void>;
  /** Base URL of the web app, for redirecting back to settings. */
  frontendBaseUrl: string;
  readConfig(integrationId: string): Promise<string | null>;
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
