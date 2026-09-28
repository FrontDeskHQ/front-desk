import { z } from "zod";

import type { IntegrationCredentialStore } from "./credential-store";

export const linearCredentialSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  refreshToken: z.string().min(1),
  scope: z.union([z.string(), z.array(z.string())]),
  tokenType: z.string().min(1),
  viewerId: z.string().min(1),
});

export type LinearCredential = z.infer<typeof linearCredentialSchema>;

export interface LinearCredentialContext {
  credential: LinearCredential;
  organizationId: string;
  /** Core's credential version this value was read at or written as. */
  version: number;
}

export interface LinearClientEnvironment {
  clientId: string;
  clientSecret: string;
  credentials: IntegrationCredentialStore;
}

const credentialLoads = new Map<string, Promise<LinearCredentialContext>>();
const pendingCredentials = new Map<string, LinearCredentialContext>();
const LINEAR_REQUEST_TIMEOUT_MS = 15_000;
const CREDENTIAL_REFRESH_WINDOW_MS = 5 * 60_000;
const CREDENTIAL_PERSIST_ATTEMPTS = 3;
const CREDENTIAL_ROTATION_ATTEMPTS = 3;

export interface LinearRequestOptions {
  signal?: AbortSignal;
}

const requestSignal = (signal?: AbortSignal): AbortSignal =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(LINEAR_REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(LINEAR_REQUEST_TIMEOUT_MS);

const parseStored = (
  stored: Awaited<ReturnType<IntegrationCredentialStore["read"]>>
): LinearCredentialContext | null =>
  stored
    ? {
        credential: linearCredentialSchema.parse(stored.credential),
        organizationId: stored.organizationId,
        version: stored.version,
      }
    : null;

type PersistOutcome =
  | { status: "written"; context: LinearCredentialContext }
  | { status: "conflict" }
  | { status: "failed" };

const persistCredential = async (
  integrationId: string,
  environment: LinearClientEnvironment,
  context: LinearCredentialContext,
  options: LinearRequestOptions = {}
): Promise<PersistOutcome> => {
  for (let attempt = 0; attempt < CREDENTIAL_PERSIST_ATTEMPTS; attempt++) {
    try {
      const result = await environment.credentials.write(
        integrationId,
        context.credential,
        context.version,
        { signal: requestSignal(options.signal) }
      );
      if (!result.ok) return { status: "conflict" };
      return {
        context: { ...context, version: result.version },
        status: "written",
      };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      // A later attempt may succeed; retain the refreshed value if core
      // remains unavailable after the bounded retry window.
    }
  }

  console.error(
    `[Linear] Failed to persist refreshed credential for ${integrationId}`
  );
  return { status: "failed" };
};

const refreshLinearCredential = async (
  context: LinearCredentialContext,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch,
  options: LinearRequestOptions = {}
): Promise<LinearCredentialContext> => {
  const refreshResponse = await fetcher("https://api.linear.app/oauth/token", {
    body: new URLSearchParams({
      client_id: environment.clientId,
      client_secret: environment.clientSecret,
      grant_type: "refresh_token",
      refresh_token: context.credential.refreshToken,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    redirect: "error",
    signal: requestSignal(options.signal),
  });
  if (!refreshResponse.ok) throw new Error("LINEAR_TOKEN_REFRESH_FAILED");
  const refreshed = z
    .object({
      access_token: z.string().min(1),
      expires_in: z.number().positive(),
      refresh_token: z.string().min(1),
      scope: z.union([z.string(), z.array(z.string())]),
      token_type: z.string().min(1),
    })
    .parse(await refreshResponse.json());
  return {
    credential: {
      accessToken: refreshed.access_token,
      expiresAt: new Date(
        Date.now() + refreshed.expires_in * 1000
      ).toISOString(),
      refreshToken: refreshed.refresh_token,
      scope: refreshed.scope,
      tokenType: refreshed.token_type,
      viewerId: context.credential.viewerId,
    },
    organizationId: context.organizationId,
    version: context.version,
  };
};

const isCredentialUsable = (context: LinearCredentialContext): boolean =>
  new Date(context.credential.expiresAt).getTime() >
  Date.now() + CREDENTIAL_REFRESH_WINDOW_MS;

const readStored = async (
  integrationId: string,
  environment: LinearClientEnvironment,
  options: LinearRequestOptions
): Promise<LinearCredentialContext | null> =>
  parseStored(
    await environment.credentials.read(integrationId, {
      signal: requestSignal(options.signal),
    })
  );

/**
 * Refresh an expiring credential and store it with compare-and-swap. When
 * another writer rotated first, its credential wins: re-read and use it (or
 * refresh from it) instead of persisting a token Linear already invalidated.
 */
const rotate = async (
  integrationId: string,
  stale: LinearCredentialContext,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch,
  options: LinearRequestOptions
): Promise<LinearCredentialContext> => {
  let current = stale;
  for (let attempt = 0; attempt < CREDENTIAL_ROTATION_ATTEMPTS; attempt++) {
    const refreshed = isCredentialUsable(current)
      ? current
      : await refreshLinearCredential(current, environment, fetcher, options);
    const outcome = await persistCredential(
      integrationId,
      environment,
      refreshed,
      options
    );
    if (outcome.status === "written") {
      pendingCredentials.delete(integrationId);
      return outcome.context;
    }
    if (outcome.status === "failed") {
      pendingCredentials.set(integrationId, refreshed);
      return refreshed;
    }
    pendingCredentials.delete(integrationId);
    const latest = await readStored(integrationId, environment, options);
    if (!latest) throw new Error("LINEAR_CREDENTIAL_NOT_FOUND");
    if (isCredentialUsable(latest)) return latest;
    current = latest;
  }
  throw new Error("LINEAR_CREDENTIAL_ROTATION_CONFLICT");
};

const loadLinearCredential = async (
  integrationId: string,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch = fetch,
  options: LinearRequestOptions = {}
): Promise<LinearCredentialContext> => {
  const pending = pendingCredentials.get(integrationId);
  let stored: LinearCredentialContext | null;
  try {
    stored = await readStored(integrationId, environment, options);
  } catch (error) {
    if (pending) {
      return rotate(integrationId, pending, environment, fetcher, options);
    }
    throw error;
  }

  if (!stored) {
    pendingCredentials.delete(integrationId);
    throw new Error("LINEAR_CREDENTIAL_NOT_FOUND");
  }

  // A pending value is a refresh core never acknowledged. It was derived from
  // the stored version it carries; if core has moved past that version (a
  // reconnect or another rotation), the stored credential is authoritative.
  const base = pending && pending.version === stored.version ? pending : stored;
  if (base === stored) pendingCredentials.delete(integrationId);
  if (isCredentialUsable(base) && base === stored) {
    return stored;
  }
  return rotate(integrationId, base, environment, fetcher, options);
};

/** Read the stored credential without refreshing or rotating it. */
export const readLinearCredential = async (
  integrationId: string,
  environment: LinearClientEnvironment,
  options: LinearRequestOptions = {}
): Promise<LinearCredentialContext | null> => {
  const pending = pendingCredentials.get(integrationId);
  try {
    const stored = await readStored(integrationId, environment, options);
    if (!stored) pendingCredentials.delete(integrationId);
    else if (pending && pending.version !== stored.version) {
      pendingCredentials.delete(integrationId);
    }
    return stored;
  } catch (error) {
    if (pending) return pending;
    throw error;
  }
};

export const getLinearCredential = (
  integrationId: string,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch = fetch,
  options: LinearRequestOptions = {}
): Promise<LinearCredentialContext> => {
  const active = credentialLoads.get(integrationId);
  if (active) return active;

  const load = loadLinearCredential(
    integrationId,
    environment,
    fetcher,
    options
  );
  credentialLoads.set(integrationId, load);
  const clear = () => {
    if (credentialLoads.get(integrationId) === load) {
      credentialLoads.delete(integrationId);
    }
  };
  void load.then(clear, clear);
  return load;
};

export const linearGraphql = async <T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
  options: { signal?: AbortSignal } = {}
): Promise<T> => {
  const response = await fetcher("https://api.linear.app/graphql", {
    body: JSON.stringify({ query, variables }),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    method: "POST",
    redirect: "error",
    signal: options.signal
      ? AbortSignal.any([
          options.signal,
          AbortSignal.timeout(LINEAR_REQUEST_TIMEOUT_MS),
        ])
      : AbortSignal.timeout(LINEAR_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("LINEAR_GRAPHQL_REQUEST_FAILED");
  const body = (await response.json()) as { data?: T; errors?: unknown[] };
  if (body.errors?.length || !body.data) {
    throw new Error("LINEAR_GRAPHQL_RESPONSE_FAILED");
  }
  return body.data;
};
