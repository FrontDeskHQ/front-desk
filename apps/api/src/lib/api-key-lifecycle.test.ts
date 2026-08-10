import type { ApiKeyRecord } from "keypal";
import { describe, expect, it } from "vitest";

import {
  listUnrevokedApiKeys,
  resolvePrivateApiKeyExpiration,
} from "./api-key-lifecycle";

const record = (
  id: string,
  ownerId: string,
  metadata: Partial<ApiKeyRecord["metadata"]> = {}
): ApiKeyRecord => ({
  id,
  keyHash: `hash-${id}`,
  metadata: { ownerId, ...metadata },
});

describe("private API key lifecycle", () => {
  it("enforces the creation flag", () => {
    expect(() =>
      resolvePrivateApiKeyExpiration({
        featureEnabled: false,
        now: new Date("2026-01-01T00:00:00.000Z"),
      })
    ).toThrow("FEATURE_NOT_AVAILABLE");
  });

  it("defaults to one year and permits only shorter future expirations", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(
      resolvePrivateApiKeyExpiration({ featureEnabled: true, now })
    ).toStrictEqual(new Date("2027-01-01T00:00:00.000Z"));
    expect(
      resolvePrivateApiKeyExpiration({
        expiresAt: "2026-06-01T00:00:00.000Z",
        featureEnabled: true,
        now,
      })
    ).toStrictEqual(new Date("2026-06-01T00:00:00.000Z"));
    expect(() =>
      resolvePrivateApiKeyExpiration({
        expiresAt: "2028-01-01T00:00:00.000Z",
        featureEnabled: true,
        now,
      })
    ).toThrow("INVALID_PRIVATE_API_KEY_EXPIRATION");
  });

  it("accepts the one-year calendar date independent of the exact instant", () => {
    expect(
      resolvePrivateApiKeyExpiration({
        expiresAt: "2027-01-01T00:00:00.000Z",
        featureEnabled: true,
        now: new Date("2026-01-01T23:00:00.000Z"),
      })
    ).toStrictEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it("lists public and private records with a discriminator and hides revoked rows", () => {
    expect(
      listUnrevokedApiKeys(
        [record("public-a", "org-a", { name: "Public" })],
        [
          record("private-a", "org-a", { name: "Private" }),
          record("revoked", "org-a", {
            revokedAt: "2026-01-01T00:00:00.000Z",
          }),
        ]
      )
    ).toStrictEqual([
      expect.objectContaining({ id: "public-a", type: "public" }),
      expect.objectContaining({ id: "private-a", type: "private" }),
    ]);
  });

  it("keeps expired records visible for owner management", () => {
    expect(
      listUnrevokedApiKeys(
        [],
        [
          record("expired", "org-a", {
            expiresAt: "2020-01-01T00:00:00.000Z",
          }),
        ]
      )
    ).toStrictEqual([
      expect.objectContaining({ id: "expired", type: "private" }),
    ]);
  });
});
