import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { isWidgetOriginAllowed, verifyWidgetToken } from "./widget-identity";

const secret = "widget-test-secret";
const now = 1_700_000_000;

const makeToken = async (options: {
  alg?: "HS256" | "HS384";
  exp?: number;
  name?: string;
  org?: string;
  sub?: string;
}) =>
  new SignJWT({
    name: options.name ?? "Ada Lovelace",
    ...(options.org ? { org: options.org } : {}),
  })
    .setProtectedHeader({ alg: options.alg ?? "HS256", typ: "JWT" })
    .setIssuer("frontdesk")
    .setAudience("frontdesk-widget")
    .setIssuedAt(now)
    .setExpirationTime(options.exp ?? now + 600)
    .setSubject(options.sub ?? "user-1")
    .sign(new TextEncoder().encode(secret));

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
