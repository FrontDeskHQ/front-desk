import { vi } from "vitest";

import type { IntegrationCredentialStore } from "./credential-store";

/** In-memory {@link IntegrationCredentialStore} with core's CAS semantics. */
export const createFakeCredentialStore = (
  initial: Record<string, { credential: unknown; organizationId: string }> = {}
) => {
  const rows = new Map(
    Object.entries(initial).map(([id, row]) => [id, { ...row, version: 1 }])
  );
  const store = {
    read: vi.fn<IntegrationCredentialStore["read"]>(async (integrationId) => {
      const row = rows.get(integrationId);
      return row ? { ...row } : null;
    }),
    write: vi.fn<IntegrationCredentialStore["write"]>(
      async (integrationId, credential, expectedVersion) => {
        const row = rows.get(integrationId);
        const current = row?.version ?? 0;
        if (current !== expectedVersion) {
          return { ok: false, version: current };
        }
        const version = current + 1;
        rows.set(integrationId, {
          credential,
          organizationId: row?.organizationId ?? "organization",
          version,
        });
        return { ok: true, version };
      }
    ),
  };
  return {
    rows,
    store,
    /** Simulate another writer (e.g. a reconnect) replacing the credential. */
    replace(integrationId: string, credential: unknown) {
      const row = rows.get(integrationId);
      rows.set(integrationId, {
        credential,
        organizationId: row?.organizationId ?? "organization",
        version: (row?.version ?? 0) + 1,
      });
    },
  };
};

/** A store where every integration holds the same usable credential. */
export const createStaticCredentialStore = (
  accessToken: string,
  organizationId: string
): IntegrationCredentialStore => ({
  read: async () => ({
    credential: {
      accessToken,
      expiresAt: "2099-01-01T00:00:00.000Z",
      refreshToken: "refresh-token",
      scope: "read issues:create",
      tokenType: "Bearer",
      viewerId: "viewer-id",
    },
    organizationId,
    version: 1,
  }),
  write: async (_integrationId, _credential, expectedVersion) => ({
    ok: true,
    version: expectedVersion + 1,
  }),
});
