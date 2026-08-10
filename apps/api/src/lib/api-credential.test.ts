import type { ApiKeyRecord } from "keypal";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.API_KEY_SALT = "test-salt";
});

import {
  resolveConnectionPrincipal,
  resolveHttpApiCredential,
  resolveWebSocketApiCredential,
} from "./api-credential";

const record = (
  id: string,
  ownerId: string,
  metadata: Partial<ApiKeyRecord["metadata"]> = {}
): ApiKeyRecord => ({
  id,
  keyHash: "hash",
  metadata: { ownerId, ...metadata },
});

const dependencies = {
  internalKey: "internal-secret",
  verifyPrivate: async (key: string) =>
    key === "private-secret" ? record("private-a", "org-a") : null,
  verifyPublic: async (key: string) =>
    key === "public-secret" ? record("public-a", "org-a") : null,
};

describe("HTTP API credential resolution", () => {
  it("accepts private Bearer, public-header, and internal-header credentials", async () => {
    await expect(
      resolveHttpApiCredential(
        { authorization: "Bearer private-secret" },
        dependencies
      )
    ).resolves.toStrictEqual({
      privateApiKey: { id: "private-a", ownerId: "org-a" },
    });
    await expect(
      resolveHttpApiCredential(
        { "x-public-api-key": "public-secret" },
        dependencies
      )
    ).resolves.toStrictEqual({ publicApiKey: { ownerId: "org-a" } });
    await expect(
      resolveHttpApiCredential(
        { "x-discord-bot-key": "internal-secret" },
        dependencies
      )
    ).resolves.toStrictEqual({ internalApiKey: true });
  });

  it("allows a passive cookie beside one explicit credential", async () => {
    await expect(
      resolveHttpApiCredential(
        { authorization: "Bearer private-secret", cookie: "session=abc" },
        dependencies
      )
    ).resolves.toMatchObject({ privateApiKey: { ownerId: "org-a" } });
  });

  it("rejects conflicting or malformed explicit credentials", async () => {
    await expect(
      resolveHttpApiCredential(
        {
          authorization: "Bearer private-secret",
          "x-public-api-key": "public-secret",
        },
        dependencies
      )
    ).rejects.toThrow("CONFLICTING_API_CREDENTIALS");
    await expect(
      resolveHttpApiCredential({ authorization: "Basic abc" }, dependencies)
    ).rejects.toThrow("INVALID_API_CREDENTIAL");
  });
});

describe("connection principal reconstruction", () => {
  it("keeps internal and private principals distinct and organization-scoped", async () => {
    await expect(
      resolveConnectionPrincipal({ type: "internal" })
    ).resolves.toStrictEqual({ internalApiKey: true });
    await expect(
      resolveConnectionPrincipal(
        { apiKeyId: "private-a", organizationId: "org-a", type: "private" },
        async () => record("private-a", "org-a")
      )
    ).resolves.toStrictEqual({
      privateApiKey: { id: "private-a", ownerId: "org-a" },
    });
    await expect(
      resolveConnectionPrincipal(
        { apiKeyId: "private-a", organizationId: "org-b", type: "private" },
        async () => record("private-a", "org-a")
      )
    ).resolves.toBeNull();
  });

  it("invalidates connection principals when the private key is revoked or expired", async () => {
    await expect(
      resolveConnectionPrincipal(
        { apiKeyId: "key", organizationId: "org", type: "private" },
        async () =>
          record("key", "org", { revokedAt: "2026-01-01T00:00:00.000Z" })
      )
    ).resolves.toBeNull();
    await expect(
      resolveConnectionPrincipal(
        { apiKeyId: "key", organizationId: "org", type: "private" },
        async () =>
          record("key", "org", { expiresAt: "2020-01-01T00:00:00.000Z" })
      )
    ).resolves.toBeNull();
  });
});

describe("WebSocket API credential resolution", () => {
  it("uses one-time tokens for private/internal principals", async () => {
    await expect(
      resolveWebSocketApiCredential(
        { token: "connection-token" },
        {
          consumeToken: async () => ({
            privateApiKey: { id: "private-a", ownerId: "org-a" },
          }),
        }
      )
    ).resolves.toStrictEqual({
      privateApiKey: { id: "private-a", ownerId: "org-a" },
    });
  });

  it("accepts a public key by query param but never a bare internal key", async () => {
    await expect(
      resolveWebSocketApiCredential(
        { publicApiKey: "public-secret" },
        { verifyPublic: dependencies.verifyPublic }
      )
    ).resolves.toStrictEqual({ publicApiKey: { ownerId: "org-a" } });
    await expect(
      resolveWebSocketApiCredential({ discordBotKey: "internal-secret" })
    ).resolves.toBeNull();
  });

  it("rejects mixed durable and one-time WebSocket credentials", async () => {
    await expect(
      resolveWebSocketApiCredential({
        discordBotKey: "internal-secret",
        token: "connection-token",
      })
    ).rejects.toThrow("CONFLICTING_API_CREDENTIALS");
  });
});
