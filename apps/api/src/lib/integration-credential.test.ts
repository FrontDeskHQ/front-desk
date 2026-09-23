import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
  readIntegrationCredentialKeyring,
} from "./integration-credential";
import type { IntegrationCredentialKeyring } from "./integration-credential";

const keyring = (): IntegrationCredentialKeyring => ({
  currentKeyId: "2026-09",
  keys: new Map([["2026-09", randomBytes(32)]]),
});

describe("integration credential encryption", () => {
  it("round-trips an opaque credential within its integration scope", () => {
    const keys = keyring();
    const scope = { integrationId: "int-a", organizationId: "org-a" };
    const encrypted = encryptIntegrationCredential(
      { accessToken: "access", refreshToken: "refresh" },
      scope,
      keys
    );

    expect(encrypted.encryptedPayload).not.toContain("access");
    expect(
      decryptIntegrationCredential(
        encrypted.encryptedPayload,
        encrypted.keyId,
        scope,
        keys
      )
    ).toStrictEqual({ accessToken: "access", refreshToken: "refresh" });
  });

  it("rejects ciphertext moved to another integration", () => {
    const keys = keyring();
    const encrypted = encryptIntegrationCredential(
      { accessToken: "access" },
      { integrationId: "int-a", organizationId: "org-a" },
      keys
    );

    expect(() =>
      decryptIntegrationCredential(
        encrypted.encryptedPayload,
        encrypted.keyId,
        { integrationId: "int-b", organizationId: "org-a" },
        keys
      )
    ).toThrow("Unsupported state or unable to authenticate data");
  });

  it.each([
    ["iv", 11],
    ["authTag", 15],
  ] as const)("rejects an invalid %s length", (field, bytes) => {
    const keys = keyring();
    const scope = { integrationId: "int-a", organizationId: "org-a" };
    const encrypted = encryptIntegrationCredential(
      { accessToken: "access" },
      scope,
      keys
    );
    const envelope = JSON.parse(encrypted.encryptedPayload) as Record<
      string,
      string
    >;
    envelope[field] = Buffer.alloc(bytes).toString("base64");

    expect(() =>
      decryptIntegrationCredential(
        JSON.stringify(envelope),
        encrypted.keyId,
        scope,
        keys
      )
    ).toThrow("INTEGRATION_CREDENTIAL_ENVELOPE_INVALID");
  });

  it("decrypts credentials written with a previous key version", () => {
    const previousKey = randomBytes(32);
    const currentKey = randomBytes(32);
    const scope = { integrationId: "int-a", organizationId: "org-a" };
    const encrypted = encryptIntegrationCredential(
      { accessToken: "access" },
      scope,
      {
        currentKeyId: "key-a",
        keys: new Map([["key-a", previousKey]]),
      }
    );

    expect(
      decryptIntegrationCredential(
        encrypted.encryptedPayload,
        encrypted.keyId,
        scope,
        {
          currentKeyId: "key-b",
          keys: new Map([
            ["key-a", previousKey],
            ["key-b", currentKey],
          ]),
        }
      )
    ).toStrictEqual({ accessToken: "access" });
  });

  it("rejects credentials whose key version is unavailable", () => {
    const scope = { integrationId: "int-a", organizationId: "org-a" };
    const encrypted = encryptIntegrationCredential(
      { accessToken: "access" },
      scope,
      keyring()
    );

    expect(() =>
      decryptIntegrationCredential(
        encrypted.encryptedPayload,
        encrypted.keyId,
        scope,
        {
          currentKeyId: "key-b",
          keys: new Map([["key-b", randomBytes(32)]]),
        }
      )
    ).toThrow("INTEGRATION_CREDENTIAL_KEY_NOT_FOUND");
  });

  it("loads a versioned keyring from environment values", () => {
    const key = randomBytes(32).toString("base64");
    const parsed = readIntegrationCredentialKeyring({
      INTEGRATION_CREDENTIAL_CURRENT_KEY_ID: "current",
      INTEGRATION_CREDENTIAL_KEYS: JSON.stringify({ current: key }),
    });

    expect(parsed.currentKeyId).toBe("current");
    expect(parsed.keys.get("current")).toHaveLength(32);
  });
});
