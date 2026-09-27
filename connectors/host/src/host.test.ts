import { createHmac } from "node:crypto";

import type { LiveStateFetchClient } from "@connectors/framework/runtime";
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

const webhookRequest = (body: string, secret = "webhook-secret") =>
  new Request("http://localhost/linear/api/webhook", {
    body,
    headers: {
      "content-type": "text/plain",
      "linear-signature": createHmac("sha256", secret)
        .update(body)
        .digest("hex"),
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
    const unsupportedConnector: HostedConnector = {
      async invoke() {
        return { body: { error: "METHOD_NOT_IMPLEMENTED" }, status: 501 };
      },
      async probe() {
        return { live: false };
      },
      type: "unsupported",
    };
    const unsupportedApp = createConnectorHost({
      connectors: [unsupportedConnector],
      secret: "connector-secret",
    });
    const response = await unsupportedApp.handle(
      request("/unsupported/api/capabilities/invoke", {
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

  it("rejects malformed Linear OAuth callbacks before exchanging a code", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const oauthApp = createConnectorHost({
      connectors: [linearConnector],
      fetcher,
      linearOAuthEnvironment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        connectorSecret: "connector-secret",
        frontendBaseUrl: "https://frontdesk.test",
        redirectUri:
          "https://connectors.frontdesk.test/linear/api/oauth/callback",
      },
      secret: "connector-secret",
    });

    const response = await oauthApp.handle(
      new Request(
        "http://localhost/linear/api/oauth/callback?code=code&state=bad"
      )
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://frontdesk.test/app/settings/organization/integration/linear?error=invalid_state"
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("distinguishes malformed webhooks from processing failures", async () => {
    const syncIssue = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const enqueueWebhook = vi
      .fn<(rawBody: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const integration = {
      configStr: JSON.stringify({ workspaceId: "workspace-1" }),
      enabled: true,
      id: "integration-1",
      organizationId: "organization-1",
    };
    const fetchClient = {
      query: {
        integration: {
          byId: vi.fn<() => Promise<unknown>>().mockResolvedValue(integration),
          listByType: vi
            .fn<() => Promise<unknown[]>>()
            .mockResolvedValue([integration]),
        },
      },
    } as unknown as LiveStateFetchClient;
    const webhookApp = createConnectorHost({
      connectors: [linearConnector],
      linearSync: {
        fetchClient,
        removeIssue: vi.fn<() => Promise<void>>(),
        enqueueWebhook,
        syncIntegration: vi.fn<() => Promise<void>>(),
        syncIssue,
        webhookSecret: "webhook-secret",
      },
      secret: "connector-secret",
    });
    const error = vi.spyOn(console, "error").mockReturnValue(undefined);
    const unauthorized = await webhookApp.handle(
      webhookRequest("{}", "wrong-secret")
    );
    const invalid = await webhookApp.handle(webhookRequest("{"));
    const invalidIssue = await webhookApp.handle(
      webhookRequest(
        JSON.stringify({
          action: "update",
          data: {},
          organizationId: "workspace-1",
          type: "Issue",
          webhookTimestamp: Date.now(),
        })
      )
    );
    const acceptedBody = JSON.stringify({
      action: "update",
      data: { id: "issue-1" },
      organizationId: "workspace-1",
      type: "Issue",
      webhookTimestamp: Date.now(),
    });
    const accepted = await webhookApp.handle(webhookRequest(acceptedBody));
    enqueueWebhook.mockRejectedValueOnce(new Error("queue unavailable"));
    const processingFailure = await webhookApp.handle(
      webhookRequest(acceptedBody)
    );

    expect({
      acceptedStatus: accepted.status,
      invalidIssueStatus: invalidIssue.status,
      invalidStatus: invalid.status,
      processingStatus: processingFailure.status,
      unauthorizedStatus: unauthorized.status,
    }).toStrictEqual({
      acceptedStatus: 200,
      invalidIssueStatus: 400,
      invalidStatus: 400,
      processingStatus: 500,
      unauthorizedStatus: 401,
    });
    const [unauthorizedBody, processingFailureBody, acceptedBodyResponse] =
      await Promise.all([
        unauthorized.json(),
        processingFailure.json(),
        accepted.json(),
      ]);
    expect({
      acceptedBody: acceptedBodyResponse,
      enqueuedBody: enqueueWebhook.mock.calls[0]?.[0],
      enqueueCalls: enqueueWebhook.mock.calls.length,
      errorCalls: error.mock.calls.length,
      processingFailureBody,
      syncCalls: syncIssue.mock.calls.length,
      unauthorizedBody,
    }).toStrictEqual({
      acceptedBody: { ok: true },
      enqueuedBody: acceptedBody,
      enqueueCalls: 2,
      errorCalls: 3,
      processingFailureBody: { error: "WEBHOOK_PROCESSING_FAILED" },
      syncCalls: 0,
      unauthorizedBody: { error: "INVALID_SIGNATURE" },
    });
    error.mockRestore();
  });
});
