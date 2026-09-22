import { describe, expect, it, vi } from "vitest";

import type { LinearOAuthEnvironment } from "./linear-oauth";
import { completeLinearOAuth } from "./linear-oauth";

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

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.linear.app/oauth/token"
    );
    const completion = fetcher.mock.calls[2];
    expect(completion?.[0]).toBe(
      "https://api.frontdesk.test/api/internal/integrations/linear/oauth-complete"
    );
    expect(completion?.[1]?.headers).toMatchObject({
      "x-discord-bot-key": "connector-secret",
    });
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
});
