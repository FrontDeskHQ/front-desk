import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerDB: vi.fn<(...args: unknown[]) => unknown>(),
  lockOwnedIntegration: vi.fn<(...args: unknown[]) => Promise<void>>(),
  writeCredential: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock(import("@live-state/sync/server"), () => ({
  createServerDB: mocks.createServerDB,
}));
vi.mock(import("../lib/integration-credential"), () => ({
  lockOwnedIntegration: mocks.lockOwnedIntegration,
  writeIntegrationCredentialInTransaction: mocks.writeCredential,
}));
vi.mock(import("../live-state/storage"), () => ({ storage: {} }));

import { completeLinearOAuthRoute } from "./linear-oauth-complete";

const validBody = {
  credential: {
    accessToken: "access-token",
    expiresAt: "2099-01-01T00:00:00.000Z",
    refreshToken: "refresh-token",
    scope: "read issues:create",
    tokenType: "Bearer",
    viewerId: "viewer-1",
  },
  integrationId: "integration-1",
  state: "oauth-state",
  teams: [{ id: "team-1", key: "ENG", name: "Engineering" }],
  workspaceId: "workspace-1",
  workspaceName: "Acme",
};

const response = () => {
  const res = {
    end: vi.fn<() => void>(),
    json: vi.fn<(body: unknown) => void>(),
    status: vi.fn<(code: number) => unknown>(),
  };
  res.status.mockReturnValue(res);
  return res;
};

const request = (
  body: unknown = validBody,
  secret: string | undefined = "connector-secret"
) =>
  ({
    body,
    header: vi
      .fn<(name: string) => string | undefined>()
      .mockReturnValue(secret),
  }) as never;

const stateHash = createHash("sha256").update(validBody.state).digest("hex");

const database = ({
  integration = {
    configStr: "{}",
    id: "integration-1",
    organizationId: "organization-1",
    type: "linear",
    updatedAt: new Date(),
  } as null | {
    configStr: string | null;
    id: string;
    organizationId: string;
    type: string;
    updatedAt: Date;
  },
  currentIntegration = integration,
  pendingState = {
    consumedAt: null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    id: "pending-1",
    stateHash,
  },
} = {}) => {
  const integrationUpdate = vi.fn<(...args: unknown[]) => Promise<void>>();
  const stateUpdate = vi.fn<(...args: unknown[]) => Promise<void>>();
  const trx = {
    integration: {
      one: vi.fn<(id: string) => unknown>().mockReturnValue({
        get: vi
          .fn<() => Promise<typeof integration>>()
          .mockResolvedValueOnce(integration)
          .mockResolvedValue(currentIntegration),
      }),
      update: integrationUpdate,
    },
    integrationOAuthState: {
      update: stateUpdate,
      where: vi.fn<(input: unknown) => unknown>().mockReturnValue({
        get: vi
          .fn<() => Promise<(typeof pendingState)[]>>()
          .mockResolvedValue(pendingState ? [pendingState] : []),
      }),
    },
  };
  const db = {
    transaction: vi.fn<
      (
        handler: (input: { trx: typeof trx }) => Promise<unknown>
      ) => Promise<unknown>
    >(async (handler: (input: { trx: typeof trx }) => Promise<unknown>) =>
      handler({ trx })
    ),
  };
  mocks.createServerDB.mockReturnValue(db);
  return { integrationUpdate, stateUpdate, trx };
};

describe(completeLinearOAuthRoute, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DISCORD_BOT_KEY = "connector-secret";
  });

  it("rejects an invalid internal secret", async () => {
    const res = response();

    await completeLinearOAuthRoute(request(validBody, "wrong"), res as never);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "UNAUTHORIZED" });
    expect(mocks.createServerDB).not.toHaveBeenCalled();
  });

  it("rejects a credential missing a required scope", async () => {
    const res = response();
    const body = {
      ...validBody,
      credential: { ...validBody.credential, scope: "read" },
    };

    await completeLinearOAuthRoute(request(body), res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "INVALID_REQUEST" });
    expect(mocks.createServerDB).not.toHaveBeenCalled();
  });

  it("returns not found for an unknown integration", async () => {
    const res = response();
    database({ integration: null });

    await completeLinearOAuthRoute(request(), res as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: "INTEGRATION_NOT_FOUND",
    });
  });

  it("rejects a mismatched server-side state", async () => {
    const res = response();
    database({
      pendingState: {
        consumedAt: null,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        id: "pending-1",
        stateHash: "not-the-state-hash",
      },
    });

    await completeLinearOAuthRoute(request(), res as never);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "STATE_MISMATCH" });
    expect(mocks.writeCredential).not.toHaveBeenCalled();
  });

  it("rejects an already consumed server-side state", async () => {
    const res = response();
    database({
      pendingState: {
        consumedAt: new Date("2026-09-23T00:00:00.000Z"),
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        id: "pending-1",
        stateHash,
      },
    });

    await completeLinearOAuthRoute(request(), res as never);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "STATE_MISMATCH" });
    expect(mocks.writeCredential).not.toHaveBeenCalled();
  });

  it("persists the credential and integration atomically", async () => {
    const res = response();
    const { integrationUpdate, stateUpdate, trx } = database();

    await completeLinearOAuthRoute(request(), res as never);

    expect(mocks.writeCredential).toHaveBeenCalledWith(
      trx,
      expect.objectContaining({ integrationId: "integration-1" })
    );
    expect(integrationUpdate).toHaveBeenCalledWith(
      "integration-1",
      expect.objectContaining({ enabled: true })
    );
    expect(stateUpdate).toHaveBeenCalledWith(
      "pending-1",
      expect.objectContaining({ consumedAt: expect.any(Date) })
    );
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("preserves config changes made before the integration lock", async () => {
    const res = response();
    const { integrationUpdate } = database({
      currentIntegration: {
        configStr: JSON.stringify({ customSetting: "current" }),
        id: "integration-1",
        organizationId: "organization-1",
        type: "linear",
        updatedAt: new Date(),
      },
    });

    await completeLinearOAuthRoute(request(), res as never);

    const update = integrationUpdate.mock.calls[0]?.[1] as {
      configStr: string;
    };
    expect(JSON.parse(update.configStr)).toMatchObject({
      customSetting: "current",
      workspaceId: "workspace-1",
    });
  });
});
