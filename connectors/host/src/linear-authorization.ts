import { AUTHORIZATION_CALLBACK_PATH } from "@connectors/framework";
import { z } from "zod";

import { readLinearCredential } from "./linear-client";
import type { LinearClientEnvironment } from "./linear-client";
import type { HostedAuthorization } from "./provider";

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

const LINEAR_SCOPES = ["read", "issues:create"];
const LINEAR_REVOKE_TIMEOUT_MS = 15_000;

export interface LinearOAuthEnvironment {
  clientId: string;
  clientSecret: string;
  frontendBaseUrl: string;
  redirectUri: string;
}

export const readLinearOAuthEnvironment = (
  env: NodeJS.ProcessEnv = process.env
): LinearOAuthEnvironment => {
  const development = env.NODE_ENV === "development";
  const values = {
    clientId: env.LINEAR_CLIENT_ID,
    clientSecret: env.LINEAR_CLIENT_SECRET,
    frontendBaseUrl:
      env.BASE_FRONTEND_URL ??
      (development ? "http://localhost:3000" : undefined),
    redirectUri:
      env.LINEAR_REDIRECT_URI ??
      (development
        ? `http://localhost:3336/linear${AUTHORIZATION_CALLBACK_PATH}`
        : undefined),
  };
  if (
    !(
      values.clientId &&
      values.clientSecret &&
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

const hasRequiredScopes = (scope: string | string[]): boolean => {
  const granted = Array.isArray(scope) ? scope : scope.split(/[\s,]+/);
  return LINEAR_SCOPES.every((required) => granted.includes(required));
};

const readDefaultTeamId = (config: string | null): string | undefined => {
  if (!config) return undefined;
  try {
    return z
      .object({ defaultTeamId: z.string().optional() })
      .safeParse(JSON.parse(config)).data?.defaultTeamId;
  } catch {
    return undefined;
  }
};

const exchangeCode = async (
  input: { code: string; config: string | null },
  environment: LinearOAuthEnvironment,
  fetcher: typeof fetch
) => {
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
  if (!hasRequiredScopes(token.scope)) {
    throw new Error("LINEAR_SCOPES_MISSING");
  }

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
  const { organization, teams, viewer } = workspace.data.data;

  // A reconnect to a different workspace can leave the saved default team
  // pointing at a team that no longer exists.
  const defaultTeamId = readDefaultTeamId(input.config);
  const staleDefaultTeam =
    defaultTeamId !== undefined &&
    !teams.nodes.some((team) => team.id === defaultTeamId);

  return {
    configPatch: {
      ...(staleDefaultTeam ? { defaultTeamId: null } : {}),
      teams: teams.nodes,
      workspaceId: organization.id,
      workspaceName: organization.name,
    },
    credential: {
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      refreshToken: token.refresh_token,
      scope: token.scope,
      tokenType: token.token_type,
      viewerId: viewer.id,
    },
  };
};

const revokeLinearAuthorization = async (
  integrationId: string,
  clientEnvironment: LinearClientEnvironment,
  fetcher: typeof fetch
): Promise<{ alreadyRevoked?: boolean }> => {
  const signal = AbortSignal.timeout(LINEAR_REVOKE_TIMEOUT_MS);
  const context = await readLinearCredential(integrationId, clientEnvironment, {
    signal,
  });
  if (!context) return { alreadyRevoked: true };
  const response = await fetcher("https://api.linear.app/oauth/revoke", {
    body: new URLSearchParams({
      token: context.credential.accessToken,
      token_type_hint: "access_token",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal,
  });
  // Linear returns 400 for an already-revoked token and 401 when the token can
  // no longer authenticate. Both satisfy disconnect intent.
  if (![200, 400, 401].includes(response.status)) {
    throw new Error("LINEAR_REVOKE_FAILED");
  }
  return {};
};

export const createLinearAuthorization = ({
  clientEnvironment,
  environment,
  fetcher = fetch,
  onCompleted,
}: {
  clientEnvironment: LinearClientEnvironment;
  environment: LinearOAuthEnvironment;
  fetcher?: typeof fetch;
  onCompleted?: (integrationId: string) => void;
}): HostedAuthorization => ({
  authorizeUrl: ({ state }) =>
    `https://linear.app/oauth/authorize?${new URLSearchParams({
      actor: "app",
      client_id: environment.clientId,
      redirect_uri: environment.redirectUri,
      response_type: "code",
      scope: LINEAR_SCOPES.join(","),
      state,
    }).toString()}`,
  complete: (input) => exchangeCode(input, environment, fetcher),
  onCompleted,
  revoke: ({ integrationId }) =>
    revokeLinearAuthorization(integrationId, clientEnvironment, fetcher),
});
