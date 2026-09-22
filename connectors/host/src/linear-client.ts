import { z } from "zod";

const credentialSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  refreshToken: z.string().min(1),
  scope: z.union([z.string(), z.array(z.string())]),
  tokenType: z.string().min(1),
  viewerId: z.string().min(1),
});

export type LinearCredential = z.infer<typeof credentialSchema>;

export interface LinearCredentialContext {
  credential: LinearCredential;
  organizationId: string;
}

export interface LinearClientEnvironment {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  connectorSecret: string;
}

const credentialLoads = new Map<string, Promise<LinearCredentialContext>>();
const pendingCredentials = new Map<string, LinearCredentialContext>();
const LINEAR_REQUEST_TIMEOUT_MS = 15_000;
const CREDENTIAL_REFRESH_WINDOW_MS = 5 * 60_000;
const CREDENTIAL_PERSIST_ATTEMPTS = 3;

const requestCredential = async (
  environment: LinearClientEnvironment,
  body: unknown,
  fetcher: typeof fetch
): Promise<Response> =>
  fetcher(
    `${environment.apiBaseUrl}/api/internal/integrations/linear/credential`,
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "x-connector-host-key": environment.connectorSecret,
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(LINEAR_REQUEST_TIMEOUT_MS),
    }
  );

const persistCredential = async (
  integrationId: string,
  environment: LinearClientEnvironment,
  context: LinearCredentialContext,
  fetcher: typeof fetch
): Promise<boolean> => {
  for (let attempt = 0; attempt < CREDENTIAL_PERSIST_ATTEMPTS; attempt++) {
    try {
      const response = await requestCredential(
        environment,
        { credential: context.credential, integrationId, operation: "write" },
        fetcher
      );
      if (response.ok) {
        return true;
      }
    } catch {
      // A later attempt may succeed; retain the refreshed value if the broker
      // remains unavailable after the bounded retry window.
    }
  }

  console.error(
    `[Linear] Failed to persist refreshed credential for ${integrationId}`
  );
  return false;
};

const refreshLinearCredential = async (
  context: LinearCredentialContext,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch
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
    signal: AbortSignal.timeout(LINEAR_REQUEST_TIMEOUT_MS),
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
  };
};

const isCredentialUsable = (context: LinearCredentialContext): boolean =>
  new Date(context.credential.expiresAt).getTime() >
  Date.now() + CREDENTIAL_REFRESH_WINDOW_MS;

const persistOrRemember = async (
  integrationId: string,
  context: LinearCredentialContext,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch
): Promise<LinearCredentialContext> => {
  if (await persistCredential(integrationId, environment, context, fetcher)) {
    pendingCredentials.delete(integrationId);
  } else {
    pendingCredentials.set(integrationId, context);
  }
  return context;
};

const loadPendingCredential = async (
  integrationId: string,
  pending: LinearCredentialContext,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch
): Promise<LinearCredentialContext> => {
  const current = isCredentialUsable(pending)
    ? pending
    : await refreshLinearCredential(pending, environment, fetcher);
  return persistOrRemember(integrationId, current, environment, fetcher);
};

const loadLinearCredential = async (
  integrationId: string,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch = fetch
): Promise<LinearCredentialContext> => {
  const pending = pendingCredentials.get(integrationId);
  let response: Response;
  try {
    response = await requestCredential(
      environment,
      { integrationId, operation: "read" },
      fetcher
    );
  } catch (error) {
    if (pending) {
      return loadPendingCredential(
        integrationId,
        pending,
        environment,
        fetcher
      );
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status !== 404 && pending) {
      return loadPendingCredential(
        integrationId,
        pending,
        environment,
        fetcher
      );
    }
    pendingCredentials.delete(integrationId);
    throw new Error("LINEAR_CREDENTIAL_READ_FAILED");
  }

  // A successful broker read is authoritative. A pending value can be left
  // behind by a failed persistence attempt, but it must never overwrite a
  // credential that was replaced by a later OAuth completion.
  pendingCredentials.delete(integrationId);
  const parsed = z
    .object({ credential: credentialSchema, organizationId: z.string() })
    .parse(await response.json());

  if (isCredentialUsable(parsed)) {
    return parsed;
  }

  const refreshed = await refreshLinearCredential(parsed, environment, fetcher);
  return persistOrRemember(integrationId, refreshed, environment, fetcher);
};

export const getLinearCredential = (
  integrationId: string,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch = fetch
): Promise<LinearCredentialContext> => {
  const active = credentialLoads.get(integrationId);
  if (active) return active;

  const load = loadLinearCredential(integrationId, environment, fetcher);
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
