import { describe, expect, it, vi } from "vitest";

import { createFakeCredentialStore } from "./credential-store.fake";
import type { LinearOAuthEnvironment } from "./linear-authorization";
import {
  createLinearAuthorization,
  readLinearOAuthEnvironment,
} from "./linear-authorization";

const environment: LinearOAuthEnvironment = {
  clientId: "linear-client",
  clientSecret: "linear-secret",
  frontendBaseUrl: "https://frontdesk.test",
  redirectUri:
    "https://connectors.frontdesk.test/linear/authorization/callback",
};

const authorizationFor = (
  fetcher: typeof fetch,
  fake = createFakeCredentialStore()
) =>
  createLinearAuthorization({
    clientEnvironment: {
      clientId: environment.clientId,
      clientSecret: environment.clientSecret,
      credentials: fake.store,
    },
    environment,
    fetcher,
  });

const tokenResponse = (scope = "read issues:create") =>
  Response.json({
    access_token: "access-token",
    expires_in: 86_399,
    refresh_token: "refresh-token",
    scope,
    token_type: "Bearer",
  });

const workspaceResponse = () =>
  Response.json({
    data: {
      organization: { id: "workspace-1", name: "Acme" },
      teams: {
        nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }],
      },
      viewer: { id: "app-user-1" },
    },
  });

describe(createLinearAuthorization, () => {
  it("builds the authorize URL with the round-tripped state", () => {
    const url = new URL(
      authorizationFor(vi.fn<typeof fetch>()).authorizeUrl({
        integrationId: "integration-1",
        state: "integration-1.nonce",
      })
    );

    expect({
      origin: url.origin + url.pathname,
      params: Object.fromEntries(url.searchParams),
    }).toStrictEqual({
      origin: "https://linear.app/oauth/authorize",
      params: {
        actor: "app",
        client_id: "linear-client",
        redirect_uri:
          "https://connectors.frontdesk.test/linear/authorization/callback",
        response_type: "code",
        scope: "read,issues:create",
        state: "integration-1.nonce",
      },
    });
  });

  it("exchanges the code into a credential and a config patch", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "access-token",
          expires_in: 86_399,
          refresh_token: "refresh-token",
          scope: "read issues:create",
          token_type: "Bearer",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            organization: { id: "workspace-1", name: "Acme" },
            teams: {
              nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }],
            },
            viewer: { id: "app-user-1" },
          },
        })
      );

    const result = await authorizationFor(fetcher).complete({
      code: "oauth-code",
      config: JSON.stringify({ defaultTeamId: "gone-team" }),
      integrationId: "integration-1",
    });

    expect(fetcher.mock.calls[0]).toMatchObject([
      "https://api.linear.app/oauth/token",
      {
        body: new URLSearchParams({
          client_id: "linear-client",
          client_secret: "linear-secret",
          code: "oauth-code",
          grant_type: "authorization_code",
          redirect_uri:
            "https://connectors.frontdesk.test/linear/authorization/callback",
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        redirect: "error",
      },
    ]);
    const workspaceRequest = fetcher.mock.calls[1]?.[1];
    expect(fetcher.mock.calls[1]).toMatchObject([
      "https://api.linear.app/graphql",
      {
        headers: { authorization: "Bearer access-token" },
        method: "POST",
        redirect: "error",
      },
    ]);
    expect(String(workspaceRequest?.body)).toContain("teams(first: 100)");
    expect(result).toMatchObject({
      configPatch: {
        defaultTeamId: null,
        teams: [{ id: "team-1", key: "ENG", name: "Engineering" }],
        workspaceId: "workspace-1",
        workspaceName: "Acme",
      },
      credential: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        viewerId: "app-user-1",
      },
    });
  });

  it("keeps a default team that still exists", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(workspaceResponse());

    const { configPatch } = await authorizationFor(fetcher).complete({
      code: "oauth-code",
      config: JSON.stringify({ defaultTeamId: "team-1" }),
      integrationId: "integration-1",
    });

    expect(configPatch).not.toHaveProperty("defaultTeamId");
  });

  it("rejects a grant missing required scopes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("read"));

    await expect(
      authorizationFor(fetcher).complete({
        code: "oauth-code",
        config: null,
        integrationId: "integration-1",
      })
    ).rejects.toThrow("LINEAR_SCOPES_MISSING");
  });

  it("revokes the stored access token", async () => {
    const fake = createFakeCredentialStore({
      "integration-1": {
        credential: {
          accessToken: "stored-access",
          expiresAt: "2099-01-01T00:00:00.000Z",
          refreshToken: "stored-refresh",
          scope: "read issues:create",
          tokenType: "Bearer",
          viewerId: "viewer",
        },
        organizationId: "organization-1",
      },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 400 }));

    const result = await authorizationFor(fetcher, fake).revoke({
      integrationId: "integration-1",
    });

    expect({
      body: String(fetcher.mock.calls[0]?.[1]?.body),
      result,
      url: fetcher.mock.calls[0]?.[0],
    }).toStrictEqual({
      body: "token=stored-access&token_type_hint=access_token",
      result: {},
      url: "https://api.linear.app/oauth/revoke",
    });
  });

  it("treats a missing credential as already revoked", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      authorizationFor(fetcher).revoke({ integrationId: "integration-1" })
    ).resolves.toStrictEqual({ alreadyRevoked: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not persist anything when Linear rejects the token exchange", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      authorizationFor(fetcher).complete({
        code: "bad-code",
        config: null,
        integrationId: "integration-1",
      })
    ).rejects.toThrow("LINEAR_TOKEN_EXCHANGE_FAILED");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("normalizes GraphQL error envelopes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "access-token",
          expires_in: 86_399,
          refresh_token: "refresh-token",
          scope: "read issues:create",
          token_type: "Bearer",
        })
      )
      .mockResolvedValueOnce(
        Response.json({ data: null, errors: [{ message: "Unauthorized" }] })
      );

    await expect(
      authorizationFor(fetcher).complete({
        code: "oauth-code",
        config: null,
        integrationId: "integration-1",
      })
    ).rejects.toThrow("LINEAR_WORKSPACE_LOOKUP_FAILED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("normalizes request timeouts", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("Timed out", "TimeoutError"));

    await expect(
      authorizationFor(fetcher).complete({
        code: "oauth-code",
        config: null,
        integrationId: "integration-1",
      })
    ).rejects.toThrow("LINEAR_CALLBACK_TIMEOUT");
  });
});

describe(readLinearOAuthEnvironment, () => {
  const credentials = {
    LINEAR_CLIENT_ID: "linear-client",
    LINEAR_CLIENT_SECRET: "linear-secret",
  };

  it("uses localhost defaults only in development", () => {
    expect(
      readLinearOAuthEnvironment({ ...credentials, NODE_ENV: "development" })
    ).toMatchObject({
      frontendBaseUrl: "http://localhost:3000",
      redirectUri: "http://localhost:3336/linear/authorization/callback",
    });
  });

  it("requires explicit service URLs in production", () => {
    expect(() =>
      readLinearOAuthEnvironment({ ...credentials, NODE_ENV: "production" })
    ).toThrow("LINEAR_OAUTH_ENVIRONMENT_REQUIRED");
  });
});
