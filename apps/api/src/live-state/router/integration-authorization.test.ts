import { describe, expect, it, vi } from "vitest";

const credentialMocks = vi.hoisted(() => ({
  lock: vi.fn<(...args: unknown[]) => Promise<void>>(),
  write: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock(import("../../lib/integration-credential"), () => ({
  clearIntegrationCredential: vi.fn<(...args: unknown[]) => Promise<void>>(),
  lockOwnedIntegration: credentialMocks.lock,
  readIntegrationCredential: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  writeIntegrationCredential: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  writeIntegrationCredentialInTransaction: credentialMocks.write,
}));

import integrationRoute from "./integration";

describe("integration authorization", () => {
  it("rejects a config change without persisting authorization", async () => {
    const integration = {
      configStr: JSON.stringify({ defaultTeamId: "team-new" }),
      id: "integration-1",
      organizationId: "organization-1",
      type: "linear",
    };
    const integrationUpdate = vi.fn<(...args: unknown[]) => Promise<void>>();
    const stateUpdate = vi.fn<(...args: unknown[]) => Promise<void>>();
    const getIntegration = vi
      .fn<() => Promise<typeof integration>>()
      .mockResolvedValue(integration);
    const trx = {
      integration: {
        one: vi.fn<(id: string) => { get: typeof getIntegration }>(() => ({
          get: getIntegration,
        })),
        update: integrationUpdate,
      },
      integrationOAuthState: {
        update: stateUpdate,
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

    await expect(
      integrationRoute.customMutations.completeAuthorization.handler({
        db: db as never,
        req: {
          context: { internalApiKey: true },
          input: {
            connectorType: "linear",
            configPatch: { workspaceId: "workspace-new" },
            credential: { accessToken: "secret" },
            expectedConfig: JSON.stringify({ defaultTeamId: "team-old" }),
            integrationId: integration.id,
            state: "state",
          },
        },
      } as never)
    ).rejects.toThrow("AUTHORIZATION_CONFIG_CHANGED");

    expect(credentialMocks.write).not.toHaveBeenCalled();
    expect(integrationUpdate).not.toHaveBeenCalled();
    expect(stateUpdate).not.toHaveBeenCalled();
  });
});
