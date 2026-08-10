import { describe, expect, it } from "vitest";

import {
  CONNECTION_TOKEN_TTL_MS,
  createConnectionTokenService,
} from "./connection-token";
import type {
  ConnectionTokenStore,
  StoredConnectionToken,
} from "./connection-token";

const createMemoryStore = () => {
  const rows = new Map<string, StoredConnectionToken>();
  const store: ConnectionTokenStore = {
    async cleanup(now, limit) {
      const expired = [...rows.entries()]
        .filter(([, row]) => row.expiresAt <= now)
        .slice(0, limit);
      for (const [tokenHash] of expired) rows.delete(tokenHash);
      return expired.length;
    },
    async consume(tokenHash, now) {
      const row = rows.get(tokenHash);
      if (!row || row.consumedAt || row.expiresAt <= now) return null;
      row.consumedAt = now;
      return row;
    },
    async insert(token) {
      rows.set(token.tokenHash, token);
    },
  };
  return { rows, store };
};

describe("connection tokens", () => {
  it("stores a hash and reconstructs the principal with a 60-second expiry", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const { rows, store } = createMemoryStore();
    const service = createConnectionTokenService(store, {
      now: () => now,
      randomToken: () => "fd_ct_secret",
    });

    const minted = await service.mint({
      apiKeyId: "key-a",
      organizationId: "org-a",
      type: "private",
    });

    expect(minted.expiresAt).toBe("2026-01-01T00:01:00.000Z");
    expect([...rows.values()][0]?.tokenHash).not.toContain("fd_ct_secret");
    await expect(service.consume(minted.token)).resolves.toStrictEqual({
      apiKeyId: "key-a",
      organizationId: "org-a",
      type: "private",
    });
  });

  it("atomically consumes a token only once and rejects expired tokens", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const { store } = createMemoryStore();
    let sequence = 0;
    const service = createConnectionTokenService(store, {
      now: () => now,
      randomToken: () => `token-${sequence++}`,
    });

    const singleUse = await service.mint({ type: "internal" });
    await expect(service.consume(singleUse.token)).resolves.toStrictEqual({
      type: "internal",
    });
    await expect(service.consume(singleUse.token)).resolves.toBeNull();

    const expired = await service.mint({ type: "internal" });
    now = new Date(now.getTime() + CONNECTION_TOKEN_TTL_MS);
    await expect(service.consume(expired.token)).resolves.toBeNull();
  });

  it("periodically removes expired rows in bounded batches", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const { rows, store } = createMemoryStore();
    let sequence = 0;
    const service = createConnectionTokenService(store, {
      cleanupBatchSize: 1,
      cleanupEvery: 2,
      now: () => now,
      randomToken: () => `token-${sequence++}`,
    });

    await service.mint({ type: "internal" });
    now = new Date(now.getTime() + CONNECTION_TOKEN_TTL_MS);
    await service.mint({ type: "internal" });

    expect(rows.size).toBe(1);
  });
});
