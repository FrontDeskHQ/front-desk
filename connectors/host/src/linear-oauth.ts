import { z } from "zod";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  scope: z.union([z.string(), z.array(z.string())]),
  token_type: z.string().min(1),
});

const workspaceDataSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
  teams: z.object({
    nodes: z.array(
      z.object({ id: z.string(), key: z.string(), name: z.string() })
    ),
  }),
  viewer: z.object({ id: z.string() }),
});

const workspaceResponseSchema = z.object({
  data: workspaceDataSchema.nullable().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export interface LinearOAuthEnvironment {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  connectorSecret: string;
  frontendBaseUrl: string;
  redirectUri: string;
}

export const readLinearOAuthEnvironment = (
  env: NodeJS.ProcessEnv = process.env
): LinearOAuthEnvironment => {
  const development = env.NODE_ENV === "development";
  const values = {
    apiBaseUrl:
      env.LIVE_STATE_API_URL?.replace(/\/api\/ls\/?$/, "") ??
      (development ? "http://localhost:3333" : undefined),
    clientId: env.LINEAR_CLIENT_ID,
    clientSecret: env.LINEAR_CLIENT_SECRET,
    connectorSecret: env.CONNECTOR_HOST_SECRET,
    frontendBaseUrl:
      env.BASE_FRONTEND_URL ??
      (development ? "http://localhost:3000" : undefined),
    redirectUri:
      env.LINEAR_REDIRECT_URI ??
      (development
        ? "http://localhost:3336/linear/api/oauth/callback"
        : undefined),
  };
  if (
    !(
      values.apiBaseUrl &&
      values.clientId &&
      values.clientSecret &&
      values.connectorSecret &&
      values.frontendBaseUrl &&
      values.redirectUri
    )
  ) {
    throw new Error("LINEAR_OAUTH_ENVIRONMENT_REQUIRED");
  }
  return values as LinearOAuthEnvironment;
};

const fetchWithTimeout = async (
  fetcher: typeof fetch,
  input: string,
  init: RequestInit
): Promise<Response> => {
  try {
    return await fetcher(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new Error("LINEAR_CALLBACK_TIMEOUT", { cause: error });
    }
    throw error;
  }
};

const requireOk = async (response: Response, code: string) => {
  if (!response.ok) {
    throw new Error(code);
  }
  return response;
};

export const completeLinearOAuth = async (
  input: { code: string; integrationId: string; state: string },
  environment: LinearOAuthEnvironment,
  fetcher: typeof fetch = fetch
): Promise<void> => {
  const tokenResponse = await requireOk(
    await fetchWithTimeout(fetcher, "https://api.linear.app/oauth/token", {
      body: new URLSearchParams({
        client_id: environment.clientId,
        client_secret: environment.clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: environment.redirectUri,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    }),
    "LINEAR_TOKEN_EXCHANGE_FAILED"
  );
  const token = tokenResponseSchema.parse(await tokenResponse.json());

  const workspaceResponse = await requireOk(
    await fetchWithTimeout(fetcher, "https://api.linear.app/graphql", {
      body: JSON.stringify({
        query: `query FrontDeskWorkspaceSetup {
          viewer { id }
          organization { id name }
          teams(first: 100) { nodes { id key name } }
        }`,
      }),
      headers: {
        authorization: `Bearer ${token.access_token}`,
        "content-type": "application/json",
      },
      method: "POST",
    }),
    "LINEAR_WORKSPACE_LOOKUP_FAILED"
  );
  const workspace = workspaceResponseSchema.safeParse(
    await workspaceResponse.json()
  );
  if (
    !workspace.success ||
    workspace.data.errors?.length ||
    !workspace.data.data
  ) {
    throw new Error("LINEAR_WORKSPACE_LOOKUP_FAILED");
  }

  const completeResponse = await fetchWithTimeout(
    fetcher,
    `${environment.apiBaseUrl}/api/internal/integrations/linear/oauth-complete`,
    {
      body: JSON.stringify({
        credential: {
          accessToken: token.access_token,
          expiresAt: new Date(
            Date.now() + token.expires_in * 1000
          ).toISOString(),
          refreshToken: token.refresh_token,
          scope: token.scope,
          tokenType: token.token_type,
          viewerId: workspace.data.data.viewer.id,
        },
        integrationId: input.integrationId,
        state: input.state,
        teams: workspace.data.data.teams.nodes,
        workspaceId: workspace.data.data.organization.id,
        workspaceName: workspace.data.data.organization.name,
      }),
      headers: {
        "content-type": "application/json",
        "x-connector-host-key": environment.connectorSecret,
      },
      method: "POST",
    }
  );
  await requireOk(completeResponse, "LINEAR_CREDENTIAL_PERSIST_FAILED");
};
