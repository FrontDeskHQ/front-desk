import { describe, expect, it, vi } from "vitest";

import { createConnectorHost } from "./host";
import type { HostedConnector } from "./host";
import { linearConnector } from "./linear";

const request = (
  path: string,
  body: unknown,
  secret: string | null = "connector-secret"
) =>
  new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-connector-secret": secret } : {}),
    },
    method: "POST",
  });

describe(createConnectorHost, () => {
  const app = createConnectorHost({
    connectors: [linearConnector],
    secret: "connector-secret",
  });

  it("routes an authenticated invocation to its connector", async () => {
    const response = await app.handle(
      request("/linear/api/capabilities/invoke", {
        capability: "issue-tracker",
        config: null,
        method: "listTargets",
        payload: {},
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ targets: [] });
  });

  it("rejects a malformed invocation envelope", async () => {
    const response = await app.handle(
      request("/linear/api/capabilities/invoke", {
        capability: "issue-tracker",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      error: "INVALID_INVOKE_ENVELOPE",
    });
  });

  it("passes through a connector's non-success status", async () => {
    const response = await app.handle(
      request("/linear/api/capabilities/invoke", {
        capability: "issue-tracker",
        config: null,
        method: "unknown",
        payload: {},
      })
    );

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toStrictEqual({
      error: "METHOD_NOT_IMPLEMENTED",
    });
  });

  it("keeps connector invocations private", async () => {
    const response = await app.handle(
      request(
        "/linear/api/capabilities/invoke",
        {
          capability: "issue-tracker",
          config: null,
          method: "listTargets",
          payload: {},
        },
        null
      )
    );

    expect(response.status).toBe(401);
  });

  it("exposes the Linear connection probe on the same host", async () => {
    const response = await app.handle(
      request("/linear/api/connection/probe", { config: null })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ live: false });
  });

  it("keeps connector probes private", async () => {
    const response = await app.handle(
      request("/linear/api/connection/probe", { config: null }, null)
    );

    expect(response.status).toBe(401);
  });

  it.each([
    ["invoke", "/broken/api/capabilities/invoke", "INVOKE_FAILED"],
    ["probe", "/broken/api/connection/probe", "PROBE_FAILED"],
  ] as const)(
    "normalizes connector %s exceptions",
    async (operation, path, expectedError) => {
      const connector: HostedConnector = {
        async invoke() {
          throw new Error("sensitive upstream detail");
        },
        async probe() {
          throw new Error("sensitive upstream detail");
        },
        type: "broken",
      };
      const brokenApp = createConnectorHost({
        connectors: [connector],
        secret: "connector-secret",
      });
      const error = vi.spyOn(console, "error").mockReturnValue(undefined);
      const body =
        operation === "invoke"
          ? {
              capability: "issue-tracker",
              config: null,
              method: "listTargets",
              payload: {},
            }
          : { config: null };

      const response = await brokenApp.handle(request(path, body));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toStrictEqual({
        error: expectedError,
      });
      expect(error).toHaveBeenCalledOnce();
      error.mockRestore();
    }
  );
});
