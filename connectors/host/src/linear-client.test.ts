import { describe, expect, it, vi } from "vitest";

import { getLinearCredential } from "./linear-client";

describe(getLinearCredential, () => {
  it("serializes concurrent credential refreshes per integration", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "old-access",
            expiresAt: "2020-01-01T00:00:00.000Z",
            refreshToken: "old-refresh",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer",
          },
          organizationId: "organization-1",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: "new-access",
          expires_in: 3600,
          refresh_token: "new-refresh",
          scope: "read issues:create",
          token_type: "Bearer",
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const environment = {
      apiBaseUrl: "https://api.frontdesk.test",
      clientId: "client",
      clientSecret: "secret",
      connectorSecret: "connector",
    };

    const [first, second] = await Promise.all([
      getLinearCredential("integration-1", environment, fetcher),
      getLinearCredential("integration-1", environment, fetcher),
    ]);

    expect(first).toStrictEqual(second);
    expect(first.credential.refreshToken).toBe("new-refresh");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.filter(
        ([url]) => url === "https://api.linear.app/oauth/token"
      )
    ).toHaveLength(1);
  });
});
