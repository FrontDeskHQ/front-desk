import { describe, expect, it, vi } from "vitest";

import type { LinearOAuthEnvironment } from "./linear-oauth";
import {
  completeLinearOAuth,
  readLinearOAuthEnvironment,
} from "./linear-oauth";

const environment: LinearOAuthEnvironment = {
  apiBaseUrl: "https://api.frontdesk.test",
  clientId: "linear-client",
  clientSecret: "linear-secret",
  connectorSecret: "connector-secret",
  frontendBaseUrl: "https://frontdesk.test",
  redirectUri: "https://connectors.frontdesk.test/linear/api/oauth/callback",
};

describe(completeLinearOAuth, () => {
  it("exchanges the code and sends workspace metadata and credentials to the API", async () => {
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
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await completeLinearOAuth(
      { code: "oauth-code", integrationId: "integration-1", state: "csrf" },
      environment,
      fetcher
    );

    expect(fetcher.mock.calls[0]).toMatchObject([
      "https://api.linear.app/oauth/token",
      {
        body: new URLSearchParams({
          client_id: "linear-client",
          client_secret: "linear-secret",
          code: "oauth-code",
          grant_type: "authorization_code",
          redirect_uri:
            "https://connectors.frontdesk.test/linear/api/oauth/callback",
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
    ]);
    const workspaceRequest = fetcher.mock.calls[1]?.[1];
    expect(fetcher.mock.calls[1]).toMatchObject([
      "https://api.linear.app/graphql",
      {
        headers: { authorization: "Bearer access-token" },
        method: "POST",
      },
    ]);
    expect(String(workspaceRequest?.body)).toContain("teams(first: 100)");
    const completion = fetcher.mock.calls[2];
    expect(completion).toMatchObject([
      "https://api.frontdesk.test/api/internal/integrations/linear/oauth-complete",
      { headers: { "x-discord-bot-key": "connector-secret" } },
    ]);
    expect(JSON.parse(String(completion?.[1]?.body))).toMatchObject({
      credential: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        viewerId: "app-user-1",
      },
      integrationId: "integration-1",
      state: "csrf",
      teams: [{ id: "team-1", key: "ENG", name: "Engineering" }],
      workspaceId: "workspace-1",
      workspaceName: "Acme",
    });
  });

  it("does not persist anything when Linear rejects the token exchange", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      completeLinearOAuth(
        { code: "bad-code", integrationId: "integration-1", state: "csrf" },
        environment,
        fetcher
      )
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
      completeLinearOAuth(
        { code: "oauth-code", integrationId: "integration-1", state: "csrf" },
        environment,
        fetcher
      )
    ).rejects.toThrow("LINEAR_WORKSPACE_LOOKUP_FAILED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("normalizes request timeouts", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("Timed out", "TimeoutError"));

    await expect(
      completeLinearOAuth(
        { code: "oauth-code", integrationId: "integration-1", state: "csrf" },
        environment,
        fetcher
      )
    ).rejects.toThrow("LINEAR_CALLBACK_TIMEOUT");
  });
});

describe(readLinearOAuthEnvironment, () => {
  const credentials = {
    DISCORD_BOT_KEY: "connector-secret",
    LINEAR_CLIENT_ID: "linear-client",
    LINEAR_CLIENT_SECRET: "linear-secret",
  };

  it("uses localhost defaults only in development", () => {
    expect(
      readLinearOAuthEnvironment({ ...credentials, NODE_ENV: "development" })
    ).toMatchObject({
      apiBaseUrl: "http://localhost:3333",
      frontendBaseUrl: "http://localhost:3000",
      redirectUri: "http://localhost:3336/linear/api/oauth/callback",
    });
  });

  it("requires explicit service URLs in production", () => {
    expect(() =>
      readLinearOAuthEnvironment({ ...credentials, NODE_ENV: "production" })
    ).toThrow("LINEAR_OAUTH_ENVIRONMENT_REQUIRED");
  });
});
