import { createHmac } from "node:crypto";

import { encodeAuthorizationState } from "@connectors/framework";
import type { LiveStateFetchClient } from "@connectors/framework/runtime";
import { describe, expect, it, vi } from "vitest";

import { createConnectorHost } from "./host";
import type {
  AuthorizationCore,
  HostedAuthorization,
  HostedConnector,
  HostedConnectorProvider,
} from "./host";
import { linearConnector } from "./linear";
import { createLinearProvider } from "./linear-provider";

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
    providers: [createLinearProvider({ connector: linearConnector })],
    secret: "connector-secret",
  }).app;

  it("routes an authenticated invocation to its connector", async () => {
    const response = await app.handle(
      request("/linear/api/capabilities/invoke", {
        capability: "issue-tracker",
        config: JSON.stringify({
          teams: [{ id: "team-1", key: "ENG", name: "Engineering" }],
          workspaceId: "workspace-1",
          workspaceName: "Acme",
        }),
        method: "listTargets",
        payload: {},
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      targets: [
        {
          label: "ENG — Engineering",
          target: { teamId: "team-1" },
        },
      ],
    });
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
      providers: [
        {
          connector: unsupportedConnector,
          registerRoutes() {},
        },
      ],
      secret: "connector-secret",
    }).app;
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

  it("owns provider startup and shutdown", async () => {
    const start = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const stop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const provider: HostedConnectorProvider = {
      connector: {
        async invoke() {
          return { body: {}, status: 200 };
        },
        async probe() {
          return { live: true };
        },
        type: "lifecycle",
      },
      registerRoutes() {},
      start,
      stop,
    };
    const host = createConnectorHost({
      providers: [provider],
      secret: "connector-secret",
    });

    await host.start();
    await host.start();
    await host.stop();
    await host.stop();

    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("shares startup work and retries after a failed startup", async () => {
    let shouldFail = true;
    const start = vi.fn<() => Promise<void>>(() => {
      if (shouldFail) return Promise.reject(new Error("startup failed"));
      return Promise.resolve();
    });
    const provider: HostedConnectorProvider = {
      connector: {
        async invoke() {
          return { body: {}, status: 200 };
        },
        async probe() {
          return { live: true };
        },
        type: "startup-race",
      },
      registerRoutes() {},
      start,
    };
    const host = createConnectorHost({
      providers: [provider],
      secret: "connector-secret",
    });

    const firstStart = host.start();
    const secondStart = host.start();
    expect(secondStart).toBe(firstStart);
    expect(start).toHaveBeenCalledOnce();

    await expect(Promise.all([firstStart, secondStart])).rejects.toThrow(
      "startup failed"
    );
    shouldFail = false;
    await host.start();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("does not restart providers that completed partial startup", async () => {
    const firstStart = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const secondStart = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("startup failed"))
      .mockResolvedValue(undefined);
    const makeProvider = (
      type: string,
      start: () => Promise<void>
    ): HostedConnectorProvider => ({
      connector: {
        async invoke() {
          return { body: {}, status: 200 };
        },
        async probe() {
          return { live: true };
        },
        type,
      },
      registerRoutes() {},
      start,
    });
    const host = createConnectorHost({
      providers: [
        makeProvider("started", firstStart),
        makeProvider("failed", secondStart),
      ],
      secret: "connector-secret",
    });

    await expect(host.start()).rejects.toThrow("startup failed");
    await host.start();

    expect(firstStart).toHaveBeenCalledOnce();
    expect(secondStart).toHaveBeenCalledTimes(2);
  });

  it("retries only providers whose shutdown failed", async () => {
    const failedStop = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("shutdown failed"))
      .mockResolvedValue(undefined);
    const successfulStop = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const makeProvider = (
      type: string,
      stop: () => Promise<void>
    ): HostedConnectorProvider => ({
      connector: {
        async invoke() {
          return { body: {}, status: 200 };
        },
        async probe() {
          return { live: true };
        },
        type,
      },
      registerRoutes() {},
      stop,
    });
    const host = createConnectorHost({
      providers: [
        makeProvider("failed-stop", failedStop),
        makeProvider("successful-stop", successfulStop),
      ],
      secret: "connector-secret",
    });

    await expect(host.stop()).rejects.toThrow("shutdown failed");
    await host.stop();

    expect(failedStop).toHaveBeenCalledTimes(2);
    expect(successfulStop).toHaveBeenCalledOnce();
  });

  it("does not restart after shutdown has begun", async () => {
    const firstStart = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const secondStart = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("startup failed"));
    const firstStop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const secondStop = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("shutdown failed"))
      .mockResolvedValue(undefined);
    const makeProvider = (
      type: string,
      start: () => Promise<void>,
      stop: () => Promise<void>
    ): HostedConnectorProvider => ({
      connector: {
        async invoke() {
          return { body: {}, status: 200 };
        },
        async probe() {
          return { live: true };
        },
        type,
      },
      registerRoutes() {},
      start,
      stop,
    });
    const host = createConnectorHost({
      providers: [
        makeProvider("started", firstStart, firstStop),
        makeProvider("failed", secondStart, secondStop),
      ],
      secret: "connector-secret",
    });

    await expect(host.start()).rejects.toThrow("startup failed");
    await expect(host.stop()).rejects.toThrow("shutdown failed");
    await host.start();
    await host.stop();

    expect({
      firstStart: firstStart.mock.calls.length,
      firstStop: firstStop.mock.calls.length,
      secondStart: secondStart.mock.calls.length,
      secondStop: secondStop.mock.calls.length,
    }).toStrictEqual({
      firstStart: 1,
      firstStop: 1,
      secondStart: 1,
      secondStop: 2,
    });
  });

  it("waits for Linear reconciliation before closing its sync", async () => {
    let resolveSync!: () => void;
    const syncAll = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveSync = resolve;
        })
    );
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const provider = createLinearProvider({
      connector: linearConnector,
      sync: {
        close,
        enqueueWebhook: vi
          .fn<(rawBody: string) => Promise<void>>()
          .mockResolvedValue(undefined),
        fetchClient: {} as LiveStateFetchClient,
        removeIssue: vi.fn<() => Promise<void>>(),
        syncAll,
        syncIntegration: vi.fn<() => Promise<unknown>>(),
        syncIssue: vi.fn<() => Promise<void>>(),
        webhookSecret: "webhook-secret",
      },
    });

    provider.start?.();
    expect(syncAll).toHaveBeenCalledOnce();
    const stopPromise = provider.stop?.();
    expect(close).not.toHaveBeenCalled();

    resolveSync();
    await stopPromise;
    expect(close).toHaveBeenCalledOnce();
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
        providers: [
          {
            connector,
            registerRoutes() {},
          },
        ],
        secret: "connector-secret",
      }).app;
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

  describe("authorization routes", () => {
    const authorizationHost = () => {
      const authorization = {
        authorizeUrl: vi.fn<HostedAuthorization["authorizeUrl"]>(
          ({ state }) => `https://provider.test/authorize?state=${state}`
        ),
        complete: vi.fn<HostedAuthorization["complete"]>().mockResolvedValue({
          configPatch: { workspaceId: "workspace-1" },
          credential: { token: "secret" },
        }),
        onCompleted: vi.fn<(integrationId: string) => void>(),
        revoke: vi
          .fn<HostedAuthorization["revoke"]>()
          .mockResolvedValue({ alreadyRevoked: true }),
      };
      const core = {
        complete: vi
          .fn<AuthorizationCore["complete"]>()
          .mockResolvedValue(undefined),
        frontendBaseUrl: "https://frontdesk.test",
        readConfig: vi
          .fn<AuthorizationCore["readConfig"]>()
          .mockResolvedValue('{"defaultTeamId":"team-1"}'),
      };
      const hostApp = createConnectorHost({
        authorizationCore: core,
        providers: [
          {
            connector: {
              authorization,
              invoke: vi.fn<HostedConnector["invoke"]>(),
              probe: vi.fn<HostedConnector["probe"]>(),
              type: "acme",
            },
            registerRoutes() {},
          },
        ],
        secret: "connector-secret",
      }).app;
      return { authorization, core, hostApp };
    };

    it("rejects malformed callback state before exchanging a code", async () => {
      const { hostApp, authorization } = authorizationHost();

      const response = await hostApp.handle(
        new Request(
          "http://localhost/acme/authorization/callback?code=code&state=bad"
        )
      );

      expect({
        exchanged: authorization.complete.mock.calls.length,
        location: response.headers.get("location"),
        status: response.status,
      }).toStrictEqual({
        exchanged: 0,
        location:
          "https://frontdesk.test/app/settings/organization/integration/acme?error=invalid_state",
        status: 302,
      });
    });

    it("rejects oversized callback state before decoding it", async () => {
      const { hostApp, authorization } = authorizationHost();

      const response = await hostApp.handle(
        new Request(
          `http://localhost/acme/authorization/callback?code=code&state=${"a".repeat(513)}`
        )
      );

      expect({
        exchanged: authorization.complete.mock.calls.length,
        location: response.headers.get("location"),
      }).toStrictEqual({
        exchanged: 0,
        location:
          "https://frontdesk.test/app/settings/organization/integration/acme?error=missing_params",
      });
    });

    it("hands the exchanged credential to core with the decoded nonce", async () => {
      const { hostApp, authorization, core } = authorizationHost();
      const state = encodeAuthorizationState("acme", "integration-1", "nonce");

      const response = await hostApp.handle(
        new Request(
          `http://localhost/acme/authorization/callback?code=code&state=${state}`
        )
      );

      expect({
        completed: core.complete.mock.calls[0]?.[0],
        exchanged: authorization.complete.mock.calls[0]?.[0],
        location: response.headers.get("location"),
        onCompleted: authorization.onCompleted.mock.calls[0]?.[0],
      }).toStrictEqual({
        completed: {
          connectorType: "acme",
          configPatch: { workspaceId: "workspace-1" },
          credential: { token: "secret" },
          integrationId: "integration-1",
          state: "nonce",
        },
        exchanged: {
          code: "code",
          config: '{"defaultTeamId":"team-1"}',
          integrationId: "integration-1",
        },
        location:
          "https://frontdesk.test/app/settings/organization/integration/acme",
        onCompleted: "integration-1",
      });
    });

    it("routes integration IDs containing delimiters without truncation", async () => {
      const { core, hostApp } = authorizationHost();
      const state = encodeAuthorizationState("acme", "acme.prod", "nonce");

      await hostApp.handle(
        new Request(
          `http://localhost/acme/authorization/callback?code=code&state=${state}`
        )
      );

      expect(core.complete.mock.calls[0]?.[0].integrationId).toBe("acme.prod");
    });

    it("serves authorize URLs and revocations only to core", async () => {
      const { authorization, hostApp } = authorizationHost();

      const unauthorized = await hostApp.handle(
        new Request("http://localhost/acme/api/authorization/url", {
          body: JSON.stringify({
            config: null,
            integrationId: "integration-1",
            state: "integration-1.nonce",
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      );
      const url = await hostApp.handle(
        request("/acme/api/authorization/url", {
          config: null,
          integrationId: "integration-1",
          state: "integration-1.nonce",
        })
      );
      const revoke = await hostApp.handle(
        request("/acme/api/authorization/revoke", {
          config: null,
          integrationId: "integration-1",
        })
      );
      const unauthorizedRevoke = await hostApp.handle(
        request(
          "/acme/api/authorization/revoke",
          { config: null, integrationId: "integration-1" },
          null
        )
      );

      expect({
        revoke: await revoke.json(),
        unauthorized: unauthorized.status,
        unauthorizedRevoke: unauthorizedRevoke.status,
        url: await url.json(),
      }).toStrictEqual({
        revoke: { alreadyRevoked: true },
        unauthorized: 401,
        unauthorizedRevoke: 401,
        url: {
          url: "https://provider.test/authorize?state=integration-1.nonce",
        },
      });
      expect(authorization.authorizeUrl).toHaveBeenCalledWith({
        config: null,
        integrationId: "integration-1",
        state: "integration-1.nonce",
      });
    });

    it("rejects callback state issued for another connector type", async () => {
      const { hostApp, authorization } = authorizationHost();
      const state = encodeAuthorizationState("other", "integration-1", "nonce");

      const response = await hostApp.handle(
        new Request(
          `http://localhost/acme/authorization/callback?code=code&state=${state}`
        )
      );

      expect(response.headers.get("location")).toBe(
        "https://frontdesk.test/app/settings/organization/integration/acme?error=invalid_state"
      );
      expect(authorization.complete).not.toHaveBeenCalled();
    });

    it("reports missing callback parameters", async () => {
      const { hostApp } = authorizationHost();

      const response = await hostApp.handle(
        new Request("http://localhost/acme/authorization/callback?state=bad")
      );

      expect(response.headers.get("location")).toBe(
        "https://frontdesk.test/app/settings/organization/integration/acme?error=missing_params"
      );
    });

    it("preserves an authorization provider error", async () => {
      const { hostApp, authorization } = authorizationHost();
      const state = encodeAuthorizationState("acme", "integration-1", "nonce");

      const response = await hostApp.handle(
        new Request(
          `http://localhost/acme/authorization/callback?error=access_denied&state=${state}`
        )
      );

      expect(response.headers.get("location")).toBe(
        "https://frontdesk.test/app/settings/organization/integration/acme?error=access_denied"
      );
      expect(authorization.complete).not.toHaveBeenCalled();
    });

    it.each(["connector", "core"] as const)(
      "reports a %s callback completion failure",
      async (failureAt) => {
        const { authorization, core, hostApp } = authorizationHost();
        const error = vi.spyOn(console, "error").mockReturnValue(undefined);
        if (failureAt === "connector") {
          authorization.complete.mockRejectedValueOnce(new Error("failed"));
        } else {
          core.complete.mockRejectedValueOnce(new Error("failed"));
        }
        const state = encodeAuthorizationState(
          "acme",
          "integration-1",
          "nonce"
        );

        const response = await hostApp.handle(
          new Request(
            `http://localhost/acme/authorization/callback?code=code&state=${state}`
          )
        );

        expect(response.headers.get("location")).toBe(
          "https://frontdesk.test/app/settings/organization/integration/acme?error=callback_error"
        );
        error.mockRestore();
      }
    );

    it("keeps a completed authorization successful when its hook fails", async () => {
      const { authorization, hostApp } = authorizationHost();
      authorization.onCompleted.mockImplementationOnce(() => {
        throw new Error("hook failed");
      });
      const error = vi.spyOn(console, "error").mockReturnValue(undefined);
      const state = encodeAuthorizationState("acme", "integration-1", "nonce");

      const response = await hostApp.handle(
        new Request(
          `http://localhost/acme/authorization/callback?code=code&state=${state}`
        )
      );

      expect(response.headers.get("location")).toBe(
        "https://frontdesk.test/app/settings/organization/integration/acme"
      );
      expect(error).toHaveBeenCalledOnce();
      error.mockRestore();
    });

    it("rejects callbacks when core is not mounted", async () => {
      const { authorization } = authorizationHost();
      const hostApp = createConnectorHost({
        providers: [
          {
            connector: {
              authorization,
              invoke: vi.fn<HostedConnector["invoke"]>(),
              probe: vi.fn<HostedConnector["probe"]>(),
              type: "acme",
            },
            registerRoutes() {},
          },
        ],
        secret: "connector-secret",
      }).app;

      const response = await hostApp.handle(
        new Request("http://localhost/acme/authorization/callback")
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toStrictEqual({
        error: "AUTHORIZATION_NOT_CONFIGURED",
      });
    });
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
      providers: [
        createLinearProvider({
          connector: linearConnector,
          sync: {
            close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            fetchClient,
            removeIssue: vi.fn<() => Promise<void>>(),
            enqueueWebhook,
            syncAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            syncIntegration: vi.fn<() => Promise<void>>(),
            syncIssue,
            webhookSecret: "webhook-secret",
          },
        }),
      ],
      secret: "connector-secret",
    }).app;
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
