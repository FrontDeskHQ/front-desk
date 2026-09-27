import { afterEach, describe, expect, it, vi } from "vitest";

import { getLinearCredential } from "./linear-client";

describe(getLinearCredential, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "new-access",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "new-refresh",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer",
          },
          organizationId: "organization-1",
        })
      );
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

    expect({ first, sameResult: first === second }).toStrictEqual({
      first: expect.objectContaining({
        credential: expect.objectContaining({ refreshToken: "new-refresh" }),
      }),
      sameResult: true,
    });
    expect(
      fetcher.mock.calls.filter(
        ([url]) => url === "https://api.linear.app/oauth/token"
      )
    ).toHaveLength(1);

    const third = await getLinearCredential(
      "integration-1",
      environment,
      fetcher
    );

    expect({
      accessToken: third.credential.accessToken,
      credentialReads: fetcher.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/linear/credential") &&
          String(init?.body).includes('"operation":"read"')
      ).length,
      requests: fetcher.mock.calls.length,
      requestsHaveDeadlines: fetcher.mock.calls.every(
        ([, init]) => init?.signal
      ),
    }).toStrictEqual({
      accessToken: "new-access",
      credentialReads: 2,
      requests: 4,
      requestsHaveDeadlines: true,
    });
  });

  it("uses a refreshed credential when persistence fails", async () => {
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
          organizationId: "organization-2",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: "usable-access",
          expires_in: 3600,
          refresh_token: "rotated-refresh",
          scope: "read issues:create",
          token_type: "Bearer",
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "usable-access",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "rotated-refresh",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer",
          },
          organizationId: "organization-2",
        })
      );
    const error = vi.spyOn(console, "error").mockReturnValue(undefined);

    const result = await getLinearCredential(
      "integration-2",
      {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client",
        clientSecret: "secret",
        connectorSecret: "connector",
      },
      fetcher
    );

    expect({
      accessToken: result.credential.accessToken,
      errorCalls: error.mock.calls.length,
      refreshToken: result.credential.refreshToken,
    }).toStrictEqual({
      accessToken: "usable-access",
      errorCalls: 1,
      refreshToken: "rotated-refresh",
    });

    const recovered = await getLinearCredential(
      "integration-2",
      {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client",
        clientSecret: "secret",
        connectorSecret: "connector",
      },
      fetcher
    );

    expect(recovered).not.toBe(result);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes("/linear/credential")
      )
    ).toHaveLength(5);
  });

  it("prefers a broker credential after a pending persistence failure", async () => {
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
          organizationId: "organization-3",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: "pending-access",
          expires_in: 3600,
          refresh_token: "pending-refresh",
          scope: "read issues:create",
          token_type: "Bearer",
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "oauth-access",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "oauth-refresh",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer",
          },
          organizationId: "organization-3",
        })
      );

    const environment = {
      apiBaseUrl: "https://api.frontdesk.test",
      clientId: "client",
      clientSecret: "secret",
      connectorSecret: "connector",
    };
    vi.spyOn(console, "error").mockReturnValue(undefined);

    const first = await getLinearCredential(
      "integration-3",
      environment,
      fetcher
    );
    const second = await getLinearCredential(
      "integration-3",
      environment,
      fetcher
    );

    expect({
      firstAccessToken: first.credential.accessToken,
      secondAccessToken: second.credential.accessToken,
      refreshes: fetcher.mock.calls.filter(
        ([url]) => url === "https://api.linear.app/oauth/token"
      ).length,
      writes: fetcher.mock.calls.filter(([, init]) =>
        String(init?.body).includes('"operation":"write"')
      ).length,
    }).toStrictEqual({
      firstAccessToken: "pending-access",
      refreshes: 1,
      secondAccessToken: "oauth-access",
      writes: 3,
    });
  });
});
