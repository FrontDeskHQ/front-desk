import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  isWidgetOriginAllowed,
  readWidgetIdentitySettings,
  verifyWidgetToken,
} from "./widget-identity";

const secret = "widget-test-secret";
const now = 1_700_000_000;

const makeToken = async (options: {
  alg?: "HS256" | "HS384";
  exp?: number;
  name?: string;
  org?: string;
  organizationId?: string;
  secret?: string;
  sub?: string;
}) =>
  new SignJWT({
    name: options.name ?? "Ada Lovelace",
    ...(options.org ? { org: options.org } : {}),
    ...(options.organizationId
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
  it("accepts the current HS256 contract and returns signed identity fields", async () => {
    const token = await makeToken({ org: "org-a" });

    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-a",
        secrets: [secret],
      })
    ).resolves.toStrictEqual({
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
        secrets: [secret],
      })
    ).rejects.toThrow("INVALID_WIDGET_TOKEN");
    await expect(
      verifyWidgetToken(overlong, {
        now: () => now * 1000,
        organizationId: "org-a",
        secrets: [secret],
      })
    ).rejects.toThrow("INVALID_WIDGET_TOKEN");
  });

  it("rejects a token explicitly issued for another organization", async () => {
    const token = await makeToken({ org: "org-b" });

    await expect(
      verifyWidgetToken(token, {
        now: () => now * 1000,
        organizationId: "org-a",
        secrets: [secret],
      })
    ).rejects.toThrow("WIDGET_ORGANIZATION_MISMATCH");
  });

  it("requires every supplied organization claim to match", async () => {
    const missingClaim = await makeToken({});
    const conflictingClaims = await makeToken({
      org: "org-a",
      organizationId: "org-b",
    });

    await expect(
      verifyWidgetToken(missingClaim, {
        now: () => now * 1000,
        organizationId: "org-a",
        secrets: [secret],
      })
    ).rejects.toThrow("WIDGET_ORGANIZATION_MISMATCH");
    await expect(
      verifyWidgetToken(conflictingClaims, {
        now: () => now * 1000,
        organizationId: "org-a",
        secrets: [secret],
      })
    ).rejects.toThrow("WIDGET_ORGANIZATION_MISMATCH");
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
        secrets: [currentSecret, previousSecret],
      })
    ).resolves.toMatchObject({ organizationId: "org-a" });
    await expect(
      verifyWidgetToken(mismatchedToken, {
        now: () => now * 1000,
        organizationId: "org-a",
        secrets: [currentSecret, previousSecret],
      })
    ).rejects.toThrow("WIDGET_ORGANIZATION_MISMATCH");
  });

  it("fails closed for a present but invalid settings object", () => {
    expect(() =>
      readWidgetIdentitySettings({
        widgetIdentity: { allowedOrigins: ["app.example.com"] },
      })
    ).toThrow("INVALID_WIDGET_IDENTITY_SETTINGS");
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
      previousKeyVersion: null,
    });
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
