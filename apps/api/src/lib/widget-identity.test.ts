import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  deriveWidgetSigningSecret,
  formatWidgetSigningSecretDisplayPrefix,
  getWidgetSigningKeys,
  isWidgetOriginAllowed,
  isWidgetKeyVersionActive,
  readWidgetIdentitySettings,
  rotateWidgetIdentitySettings,
  verifyWidgetToken,
} from "./widget-identity";

const secret = "widget-test-secret";
const now = 1_700_000_000;

const makeToken = async (options: {
  alg?: "HS256" | "HS384";
  exp?: number;
  name?: string;
  org?: unknown;
  organizationId?: unknown;
  secret?: string;
  sub?: string;
}) =>
  new SignJWT({
    name: options.name ?? "Ada Lovelace",
    ...(options.org !== undefined ? { org: options.org } : {}),
    ...(options.organizationId !== undefined
      ? { organizationId: options.organizationId }
      : {}),
  })
    .setProtectedHeader({ alg: options.alg ?? "HS256", typ: "JWT" })
    .setIssuer("frontdesk")
    .setAudience("frontdesk-widget")
    .setIssuedAt(now)
    .setExpirationTime(options.exp ?? now + 600)
    .setSubject(options.sub ?? "user-1")
    .sign(new TextEncoder().encode(options.secret ?? secret));

describe("widget identity verification", () => {
  it("does not accept an undated legacy previous key", () => {
    expect(
      getWidgetSigningKeys({
        masterKey: "master-key",
        organizationId: "org-a",
        settings: {
          widgetIdentity: {
            allowedOrigins: [],
            currentKeyVersion: 2,
            previousKeyVersion: 1,
          },
        },
      }).map((key) => key.version)
    ).toStrictEqual([2]);
  });

  it("bounds previous-key acceptance and supports immediate revocation", () => {
    const settings = {
      allowedOrigins: [],
      currentKeyVersion: 2,
      previousKeyExpiresAt: new Date(now * 1000 + 15 * 60 * 1000).toISOString(),
      previousKeyVersion: 1,
    };

    expect(isWidgetKeyVersionActive(settings, 1, now * 1000)).toBeTruthy();
    expect(
      isWidgetKeyVersionActive(
        settings,
        1,
        now * 1000 + 15 * 60 * 1000 + 60 * 1000
      )
    ).toBeTruthy();
    expect(
      isWidgetKeyVersionActive(
        settings,
        1,
        now * 1000 + 15 * 60 * 1000 + 60 * 1000 + 1
      )
    ).toBeFalsy();
    expect(
      isWidgetKeyVersionActive(
        {
          ...settings,
          previousKeyExpiresAt: null,
          previousKeyVersion: null,
        },
        1,
        now * 1000
      )
    ).toBeFalsy();
  });

  it("writes a 15-minute retirement deadline or revokes the old key immediately", () => {
    const existing = {
      allowedOrigins: ["https://app.example.com"],
      currentKeyVersion: 2,
      previousKeyExpiresAt: null,
      previousKeyVersion: null,
    };

    expect(
      rotateWidgetIdentitySettings({
        existing,
        hasExistingConfiguration: true,
        now: now * 1000,
        revokePreviousImmediately: false,
      })
    ).toStrictEqual({
      allowedOrigins: ["https://app.example.com"],
      currentKeyVersion: 3,
      previousKeyExpiresAt: new Date(now * 1000 + 15 * 60 * 1000).toISOString(),
      previousKeyVersion: 2,
    });

    expect(
      rotateWidgetIdentitySettings({
        existing,
        hasExistingConfiguration: true,
        now: now * 1000,
        revokePreviousImmediately: true,
      })
    ).toStrictEqual({
      allowedOrigins: ["https://app.example.com"],
      currentKeyVersion: 3,
      previousKeyExpiresAt: null,
      previousKeyVersion: null,
    });
  });

  it("accepts the current HS256 contract and returns signed identity fields", async () => {
    const token = await makeToken({ org: "org-a" });

    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [{ expiresAt: null, secret, version: 1 }],
      })
    ).resolves.toStrictEqual({
      keyVersion: 1,
      name: "Ada Lovelace",
      organizationId: "org-a",
      userId: "user-1",
    });
  });

  it("rejects asymmetric or non-HS256 algorithms and overlong lifetimes", async () => {
    const wrongAlgorithm = await makeToken({ alg: "HS384" });
    const overlong = await makeToken({ exp: now + 901 });

    await expect(
      verifyWidgetToken(wrongAlgorithm, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [{ expiresAt: null, secret, version: 1 }],
      })
    ).rejects.toThrow(
      expect.objectContaining({ reason: "INVALID_WIDGET_TOKEN" })
    );
    await expect(
      verifyWidgetToken(overlong, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [{ expiresAt: null, secret, version: 1 }],
      })
    ).rejects.toThrow(
      expect.objectContaining({ reason: "INVALID_WIDGET_TOKEN" })
    );
  });

  it("rejects a token explicitly issued for another organization", async () => {
    const token = await makeToken({ org: "org-b" });

    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [{ expiresAt: null, secret, version: 1 }],
      })
    ).rejects.toThrow(
      expect.objectContaining({ reason: "WIDGET_ORGANIZATION_MISMATCH" })
    );
  });

  it.each([
    {},
    { organizationId: "org-a" },
    { org: "org-a", organizationId: "org-a" },
  ])(
    "resolves the organization from the verification context for %j",
    async (claims) => {
      const token = await makeToken(claims);
      await expect(
        verifyWidgetToken(token, {
          now: () => now * 1000,
          organizationId: "org-a",
          keys: [{ expiresAt: null, secret, version: 1 }],
        })
      ).resolves.toMatchObject({ organizationId: "org-a", userId: "user-1" });
    }
  );

  it.each([
    { org: "org-a", organizationId: "org-b" },
    { organizationId: "org-b" },
    { org: null },
    { org: 123 },
    { org: "" },
    { org: "org-a", organizationId: null },
  ])(
    "rejects conflicting or malformed organization claims %j",
    async (claims) => {
      const token = await makeToken(claims);
      await expect(
        verifyWidgetToken(token, {
          now: () => now * 1000,
          organizationId: "org-a",
          keys: [{ expiresAt: null, secret, version: 1 }],
        })
      ).rejects.toThrow(
        expect.objectContaining({ reason: "WIDGET_ORGANIZATION_MISMATCH" })
      );
    }
  );

  it("rejects a claimless token signed for another organization", async () => {
    const keysFor = (organizationId: string) =>
      getWidgetSigningKeys({
        masterKey: "master-key",
        organizationId,
        settings: {},
      });
    const token = await makeToken({ secret: keysFor("org-a")[0].secret });

    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: keysFor("org-a"),
      })
    ).resolves.toMatchObject({ organizationId: "org-a" });
    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-b",
        keys: keysFor("org-b"),
      })
    ).rejects.toThrow(
      expect.objectContaining({ reason: "INVALID_WIDGET_TOKEN" })
    );
  });

  it("accepts a previous signing secret and rethrows a current-key organization mismatch", async () => {
    const currentSecret = "current-widget-secret";
    const previousSecret = "previous-widget-secret";
    const previousToken = await makeToken({
      org: "org-a",
      secret: previousSecret,
    });
    const mismatchedToken = await makeToken({
      org: "org-b",
      secret: currentSecret,
    });

    await expect(
      verifyWidgetToken(previousToken, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [
          { expiresAt: null, secret: currentSecret, version: 2 },
          { expiresAt: null, secret: previousSecret, version: 1 },
        ],
      })
    ).resolves.toMatchObject({ organizationId: "org-a" });
    await expect(
      verifyWidgetToken(mismatchedToken, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [
          { expiresAt: null, secret: currentSecret, version: 2 },
          { expiresAt: null, secret: previousSecret, version: 1 },
        ],
      })
    ).rejects.toThrow(
      expect.objectContaining({ reason: "WIDGET_ORGANIZATION_MISMATCH" })
    );
  });

  it("enforces previous-key expiry during token verification", async () => {
    const previousSecret = "previous-widget-secret";
    const token = await makeToken({ org: "org-a", secret: previousSecret });

    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [
          {
            expiresAt: new Date(now * 1000 + 5 * 60 * 1000).toISOString(),
            secret: previousSecret,
            version: 1,
          },
        ],
      })
    ).resolves.toMatchObject({ keyVersion: 1 });

    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [
          {
            expiresAt: new Date(now * 1000 - 60 * 1000 - 1).toISOString(),
            secret: previousSecret,
            version: 1,
          },
        ],
      })
    ).rejects.toThrow(
      expect.objectContaining({ reason: "INVALID_WIDGET_TOKEN" })
    );

    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-a",
        keys: [
          {
            expiresAt: "not-a-date",
            secret: previousSecret,
            version: 1,
          },
        ],
      })
    ).rejects.toThrow(
      expect.objectContaining({ reason: "INVALID_WIDGET_TOKEN" })
    );
  });

  it("fails closed for a present but invalid settings object", () => {
    expect(() =>
      readWidgetIdentitySettings({
        widgetIdentity: { allowedOrigins: ["app.example.com"] },
      })
    ).toThrow(
      expect.objectContaining({ reason: "INVALID_WIDGET_IDENTITY_SETTINGS" })
    );
  });

  it("can fall back to defaults for owner settings recovery", () => {
    expect(
      readWidgetIdentitySettings(
        { widgetIdentity: { allowedOrigins: ["app.example.com"] } },
        { fallbackToDefaults: true }
      )
    ).toStrictEqual({
      allowedOrigins: [],
      currentKeyVersion: 1,
      previousKeyExpiresAt: null,
      previousKeyVersion: null,
    });
  });

  it("formats the visible signing secret prefix", () => {
    const secret = deriveWidgetSigningSecret({
      masterKey: "master-key",
      organizationId: "org-a",
      version: 1,
    });

    expect(formatWidgetSigningSecretDisplayPrefix(secret)).toBe(
      secret.slice(0, 12)
    );
    expect(formatWidgetSigningSecretDisplayPrefix(secret)).toMatch(/^fd_wsk_/u);
  });

  it("matches configured origins exactly", () => {
    expect(
      isWidgetOriginAllowed("https://app.example.com/path", [
        "https://app.example.com",
      ])
    ).toBeTruthy();
    expect(
      isWidgetOriginAllowed("https://evil.example.com", [
        "https://app.example.com",
      ])
    ).toBeFalsy();
    expect(
      isWidgetOriginAllowed(undefined, ["https://app.example.com"])
    ).toBeFalsy();
  });
});
