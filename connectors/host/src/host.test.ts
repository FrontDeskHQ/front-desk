import { describe, expect, it } from "vitest";

import { createConnectorHost } from "./host";
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
});
