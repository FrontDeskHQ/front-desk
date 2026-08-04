import Elysia from "elysia";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDeveloperActionsRoute } from "./actions";
import type { DeveloperActionHandler } from "./actions";

const secret = "connector-secret";

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/actions/invoke", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

const actionHandlers = (
  handler: DeveloperActionHandler
): Readonly<Record<string, DeveloperActionHandler>> => ({
  "test.action": handler,
});

describe("GitHub developer-action route", () => {
  afterEach(() => {
    delete process.env.DISCORD_BOT_KEY;
    vi.restoreAllMocks();
  });

  it("requires the shared connector secret", async () => {
    process.env.DISCORD_BOT_KEY = secret;
    const app = new Elysia().use(
      createDeveloperActionsRoute(
        actionHandlers(vi.fn<DeveloperActionHandler>())
      )
    );

    const response = await app.handle(
      request({ action: "test.action", config: "{}", payload: {} })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toStrictEqual({
      error: "UNAUTHORIZED",
    });
  });

  it("rejects unknown actions without parsing connector configuration", async () => {
    process.env.DISCORD_BOT_KEY = secret;
    const app = new Elysia().use(createDeveloperActionsRoute({}));

    const response = await app.handle(
      request(
        { action: "unknown.action", config: "not-json", payload: {} },
        { "x-connector-secret": secret }
      )
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toStrictEqual({
      error: "UNKNOWN_ACTION",
    });
  });

  it("returns the connector's accepted fire-and-forget result", async () => {
    process.env.DISCORD_BOT_KEY = secret;
    const handler = vi.fn<DeveloperActionHandler>(async () => ({
      body: { accepted: true, jobIds: ["job-1"] },
      status: 202,
    }));
    const app = new Elysia().use(
      createDeveloperActionsRoute(actionHandlers(handler))
    );

    const response = await app.handle(
      request(
        {
          action: "test.action",
          config: '{"installationId":123}',
          payload: { target: "entity-a" },
        },
        { "x-connector-secret": secret }
      )
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toStrictEqual({
      accepted: true,
      jobIds: ["job-1"],
    });
    expect(handler).toHaveBeenCalledExactlyOnceWith('{"installationId":123}', {
      target: "entity-a",
    });
  });

  it("normalizes handler failures", async () => {
    process.env.DISCORD_BOT_KEY = secret;
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const app = new Elysia().use(
      createDeveloperActionsRoute(
        actionHandlers(async () => {
          throw new Error("contains-secret-config");
        })
      )
    );

    const response = await app.handle(
      request(
        { action: "test.action", config: "{}", payload: {} },
        { "x-connector-secret": secret }
      )
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toStrictEqual({
      error: "ACTION_FAILED",
    });
  });
});
