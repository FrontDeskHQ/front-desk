import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeCredentialStore } from "./credential-store.fake";
import { getLinearCredential } from "./linear-client";

const credential = (overrides: Record<string, string>) => ({
  accessToken: "old-access",
  expiresAt: "2020-01-01T00:00:00.000Z",
  refreshToken: "old-refresh",
  scope: "read issues:create",
  tokenType: "Bearer",
  viewerId: "viewer",
  ...overrides,
});

const tokenResponse = (access: string, refresh: string) =>
  Response.json({
    access_token: access,
    expires_in: 3600,
    refresh_token: refresh,
    scope: "read issues:create",
    token_type: "Bearer",
  });

describe(getLinearCredential, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes concurrent credential refreshes per integration", async () => {
    const fake = createFakeCredentialStore({
      "integration-1": {
        credential: credential({}),
        organizationId: "organization-1",
      },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("new-access", "new-refresh"));
    const environment = {
      clientId: "client",
      clientSecret: "secret",
      credentials: fake.store,
    };

    const [first, second] = await Promise.all([
      getLinearCredential("integration-1", environment, fetcher),
      getLinearCredential("integration-1", environment, fetcher),
    ]);
    const third = await getLinearCredential(
      "integration-1",
      environment,
      fetcher
    );

    expect({
      firstRefreshToken: first.credential.refreshToken,
      reads: fake.store.read.mock.calls.length,
      refreshes: fetcher.mock.calls.length,
      sameResult: first === second,
      thirdAccessToken: third.credential.accessToken,
      thirdVersion: third.version,
    }).toStrictEqual({
      firstRefreshToken: "new-refresh",
      reads: 2,
      refreshes: 1,
      sameResult: true,
      thirdAccessToken: "new-access",
      thirdVersion: 2,
    });
  });

  it("uses a refreshed credential when persistence fails, then persists it", async () => {
    const fake = createFakeCredentialStore({
      "integration-2": {
        credential: credential({}),
        organizationId: "organization-2",
      },
    });
    fake.store.write
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("usable-access", "rotated-refresh"));
    const error = vi.spyOn(console, "error").mockReturnValue(undefined);
    const environment = {
      clientId: "client",
      clientSecret: "secret",
      credentials: fake.store,
    };

    const result = await getLinearCredential(
      "integration-2",
      environment,
      fetcher
    );
    const recovered = await getLinearCredential(
      "integration-2",
      environment,
      fetcher
    );

    expect({
      accessToken: result.credential.accessToken,
      errorCalls: error.mock.calls.length,
      recoveredAccessToken: recovered.credential.accessToken,
      refreshes: fetcher.mock.calls.length,
      storedCredential: fake.rows.get("integration-2")?.credential,
      writes: fake.store.write.mock.calls.length,
    }).toStrictEqual({
      accessToken: "usable-access",
      errorCalls: 1,
      recoveredAccessToken: "usable-access",
      refreshes: 1,
      storedCredential: expect.objectContaining({
        refreshToken: "rotated-refresh",
      }),
      writes: 4,
    });
  });

  it("prefers a newer stored credential over a pending one", async () => {
    const fake = createFakeCredentialStore({
      "integration-3": {
        credential: credential({}),
        organizationId: "organization-3",
      },
    });
    fake.store.write
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        tokenResponse("pending-access", "pending-refresh")
      );
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const environment = {
      clientId: "client",
      clientSecret: "secret",
      credentials: fake.store,
    };

    const first = await getLinearCredential(
      "integration-3",
      environment,
      fetcher
    );
    fake.replace(
      "integration-3",
      credential({
        accessToken: "oauth-access",
        expiresAt: "2099-01-01T00:00:00.000Z",
        refreshToken: "oauth-refresh",
      })
    );
    const second = await getLinearCredential(
      "integration-3",
      environment,
      fetcher
    );

    expect({
      firstAccessToken: first.credential.accessToken,
      refreshes: fetcher.mock.calls.length,
      secondAccessToken: second.credential.accessToken,
      writes: fake.store.write.mock.calls.length,
    }).toStrictEqual({
      firstAccessToken: "pending-access",
      refreshes: 1,
      secondAccessToken: "oauth-access",
      writes: 3,
    });
  });

  it("adopts another writer's rotation instead of overwriting it", async () => {
    const fake = createFakeCredentialStore({
      "integration-4": {
        credential: credential({}),
        organizationId: "organization-4",
      },
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => {
      fake.replace(
        "integration-4",
        credential({
          accessToken: "winner-access",
          expiresAt: "2099-01-01T00:00:00.000Z",
          refreshToken: "winner-refresh",
        })
      );
      return tokenResponse("loser-access", "loser-refresh");
    });

    const result = await getLinearCredential(
      "integration-4",
      { clientId: "client", clientSecret: "secret", credentials: fake.store },
      fetcher
    );

    expect({
      accessToken: result.credential.accessToken,
      storedCredential: fake.rows.get("integration-4")?.credential,
    }).toStrictEqual({
      accessToken: "winner-access",
      storedCredential: expect.objectContaining({
        refreshToken: "winner-refresh",
      }),
    });
  });
});
