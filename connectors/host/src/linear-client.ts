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
        "x-discord-bot-key": environment.connectorSecret,
      },
      method: "POST",
    }
  );

const loadLinearCredential = async (
  integrationId: string,
  environment: LinearClientEnvironment,
  fetcher: typeof fetch = fetch
): Promise<LinearCredentialContext> => {
  const response = await requestCredential(
    environment,
    { integrationId, operation: "read" },
    fetcher
  );
  if (!response.ok) throw new Error("LINEAR_CREDENTIAL_READ_FAILED");
  const parsed = z
    .object({ credential: credentialSchema, organizationId: z.string() })
    .parse(await response.json());

  if (
    new Date(parsed.credential.expiresAt).getTime() >
    Date.now() + 5 * 60_000
  ) {
    return parsed;
  }

  const refreshResponse = await fetcher("https://api.linear.app/oauth/token", {
    body: new URLSearchParams({
      client_id: environment.clientId,
      client_secret: environment.clientSecret,
      grant_type: "refresh_token",
      refresh_token: parsed.credential.refreshToken,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!refreshResponse.ok) throw new Error("LINEAR_TOKEN_REFRESH_FAILED");
  const refreshed = z
    .object({
      access_token: z.string(),
      expires_in: z.number().positive(),
      refresh_token: z.string(),
      scope: z.union([z.string(), z.array(z.string())]),
      token_type: z.string(),
    })
    .parse(await refreshResponse.json());
  const credential: LinearCredential = {
    accessToken: refreshed.access_token,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    refreshToken: refreshed.refresh_token,
    scope: refreshed.scope,
    tokenType: refreshed.token_type,
    viewerId: parsed.credential.viewerId,
  };
  const writeResponse = await requestCredential(
    environment,
    { credential, integrationId, operation: "write" },
    fetcher
  );
  if (!writeResponse.ok) throw new Error("LINEAR_CREDENTIAL_WRITE_FAILED");
  return { credential, organizationId: parsed.organizationId };
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
  fetcher: typeof fetch = fetch
): Promise<T> => {
  const response = await fetcher("https://api.linear.app/graphql", {
    body: JSON.stringify({ query, variables }),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) throw new Error("LINEAR_GRAPHQL_REQUEST_FAILED");
  const body = (await response.json()) as { data?: T; errors?: unknown[] };
  if (body.errors?.length || !body.data) {
    throw new Error("LINEAR_GRAPHQL_RESPONSE_FAILED");
  }
  return body.data;
};
