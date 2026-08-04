import type { ServerDB } from "@live-state/sync/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  developerActionInputSchema,
  runDeveloperAction,
} from "../live-state/router/developer-action";
import type { schema } from "../live-state/schema";
import type { AuthorizeReq } from "./authorize";
import { connectorRegistry } from "./connector-registry";
import type { DeveloperActionError } from "./developer-action-dispatch";
import { dispatchDeveloperAction } from "./developer-action-dispatch";

const organizationId = "org-a";

const memberRequest = (
  overrides: Partial<NonNullable<AuthorizeReq["context"]>> = {}
): AuthorizeReq => ({
  context: {
    orgUsers: [{ organizationId, role: "user" }],
    session: { userId: "user-a" },
    user: {
      email: "dev@tryfrontdesk.app",
      emailVerified: true,
      name: "Dev User",
    },
    ...overrides,
  },
});

const actionInput = (
  overrides: Partial<{
    action: string;
    connectorType: string;
    organizationId: string;
    payload: Record<string, unknown>;
  }> = {}
) =>
  developerActionInputSchema.parse({
    action: "pr_match_replay",
    connectorType: "github",
    organizationId,
    payload: { entityId: "entity-a" },
    ...overrides,
  });

const dbWithIntegrations = (integrations: Record<string, unknown>) => {
  const find = vi
    .fn<
      (
        table: unknown,
        request: { where?: Record<string, unknown> }
      ) => Promise<Record<string, unknown>>
    >()
    .mockImplementation(
      async (_table: unknown, request: { where?: Record<string, unknown> }) => {
        const where = request.where ?? {};
        if ("id" in where && "type" in where) {
          const entity = integrations.externalEntity as
            | Record<string, unknown>
            | undefined;
          return entity?.id === where.id ? { externalEntity: entity } : {};
        }

        return Object.fromEntries(
          Object.entries(integrations).filter(
            ([key]) => key !== "externalEntity"
          )
        );
      }
    );
  return {
    db: { find } as unknown as Pick<ServerDB<typeof schema>, "find">,
    find,
  };
};

describe("developer-action transport", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousConnectorSecret = process.env.DISCORD_BOT_KEY;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.DISCORD_BOT_KEY = "test-connector-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousConnectorSecret === undefined) {
      delete process.env.DISCORD_BOT_KEY;
    } else {
      process.env.DISCORD_BOT_KEY = previousConnectorSecret;
    }
  });

  it("authorizes before resolving organization integrations", async () => {
    const { db, find } = dbWithIntegrations({
      integration: {
        configStr: '{"shouldNot":"beRead"}',
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });

    const nodeEnvBeforeProduction = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      await expect(
        runDeveloperAction(
          db,
          memberRequest({
            user: {
              email: "external@example.com",
              emailVerified: true,
            },
          }),
          actionInput()
        )
      ).rejects.toThrow("UNAUTHORIZED");
      expect(find).not.toHaveBeenCalled();
    } finally {
      if (nodeEnvBeforeProduction === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = nodeEnvBeforeProduction;
      }
    }
  });

  it("resolves the org integration and returns a safe accepted result", async () => {
    const { db, find } = dbWithIntegrations({
      externalEntity: {
        externalKey: "github:owner/repo#123",
        id: "entity-a",
        number: 123,
        organizationId,
        provider: "github",
        repoFullName: "owner/repo",
        type: "pull_request",
        url: "https://github.com/owner/repo/pull/123",
      },
      integration: {
        configStr: '{"installationId":123,"secret":"do-not-log"}',
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toMatch(/\/api\/actions\/invoke$/);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "x-connector-secret": "test-connector-secret",
      });
      expect(init?.redirect).toBe("error");
      expect(JSON.parse(String(init?.body))).toStrictEqual({
        action: "pr_match_replay",
        config: '{"installationId":123,"secret":"do-not-log"}',
        payload: {
          organizationId,
          target: {
            externalKey: "github:owner/repo#123",
            number: 123,
            repoFullName: "owner/repo",
            url: "https://github.com/owner/repo/pull/123",
          },
        },
      });

      return new Response(
        JSON.stringify({
          accepted: true,
          jobIds: ["pr-match:entity-a"],
          target: "github:owner/repo#123",
        }),
        { status: 202 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "info").mockReturnValue(undefined);

    const result = await runDeveloperAction(db, memberRequest(), actionInput());

    expect(result).toStrictEqual({
      accepted: true,
      jobIds: ["pr-match:entity-a"],
      target: "github:owner/repo#123",
    });
    expect(find).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("do-not-log"));
  });

  it("rejects a missing mirrored PR target before invoking the connector", async () => {
    const { db } = dbWithIntegrations({
      integration: {
        configStr: "{}",
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });
    const fetchMock = vi.fn<() => void>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dispatchDeveloperAction(db, {
        ...actionInput(),
        payload: { entityId: "missing-entity" },
      })
    ).rejects.toMatchObject<DeveloperActionError>({
      code: "INVALID_DEVELOPER_ACTION_TARGET",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes repository selection for the connector", async () => {
    const { db } = dbWithIntegrations({
      integration: {
        configStr: "{}",
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toStrictEqual({
        action: "repository_backfill",
        config: "{}",
        payload: {
          allRepositories: false,
          organizationId,
          repositories: ["owner/repo"],
        },
      });
      return new Response(
        JSON.stringify({
          accepted: true,
          jobIds: ["backfill-job"],
          target: "selected",
        }),
        { status: 202 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await dispatchDeveloperAction(db, {
      ...actionInput({ action: "repository_backfill" }),
      payload: { repositories: ["owner/repo"] },
    });

    expect(result).toStrictEqual({
      accepted: true,
      jobIds: ["backfill-job"],
      target: "selected",
    });
  });

  it("preserves partial repository backfill acceptance", async () => {
    const { db } = dbWithIntegrations({
      integration: {
        configStr: "{}",
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >(
        async () =>
          new Response(
            JSON.stringify({
              accepted: true,
              jobIds: ["backfill-job"],
              partial: true,
              target: "selected",
            }),
            { status: 207 }
          )
      )
    );

    const result = await dispatchDeveloperAction(db, {
      ...actionInput({ action: "repository_backfill" }),
      payload: { repositories: ["owner/repo"] },
    });

    expect(result).toStrictEqual({
      accepted: true,
      jobIds: ["backfill-job"],
      partial: true,
      target: "selected",
    });
  });

  it("fails safely when the integration is missing", async () => {
    const { db } = dbWithIntegrations({});
    const fetchMock = vi.fn<() => void>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runDeveloperAction(db, memberRequest(), actionInput())
    ).rejects.toThrow("INTEGRATION_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown actions and connector types before lookup", async () => {
    const { db, find } = dbWithIntegrations({
      integration: {
        configStr: "{}",
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });

    await expect(
      dispatchDeveloperAction(db, {
        ...actionInput({ action: "unknown_action" }),
        payload: {},
      })
    ).rejects.toMatchObject<DeveloperActionError>({
      code: "UNKNOWN_DEVELOPER_ACTION",
    });
    expect(find).not.toHaveBeenCalled();

    await expect(
      dispatchDeveloperAction(db, {
        ...actionInput({ connectorType: "not-a-connector" }),
        payload: {},
      })
    ).rejects.toMatchObject<DeveloperActionError>({
      code: "UNKNOWN_DEVELOPER_ACTION",
    });
    expect(find).not.toHaveBeenCalled();
  });

  it("normalizes connector rejection and does not expose its response body", async () => {
    const { db } = dbWithIntegrations({
      externalEntity: {
        externalKey: "github:owner/repo#123",
        id: "entity-a",
        number: 123,
        organizationId,
        provider: "github",
        repoFullName: "owner/repo",
        type: "pull_request",
        url: "https://github.com/owner/repo/pull/123",
      },
      integration: {
        configStr: '{"secret":"do-not-leak"}',
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<Response>>().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "connector-secret-do-not-leak" }),
          {
            status: 502,
          }
        )
      )
    );

    await expect(
      runDeveloperAction(db, memberRequest(), actionInput())
    ).rejects.toThrow("DEVELOPER_ACTION_FAILED");
  });

  it("fails closed when the connector secret is not configured", async () => {
    const { db } = dbWithIntegrations({
      integration: {
        configStr: '{"secret":"do-not-send"}',
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });
    delete process.env.DISCORD_BOT_KEY;
    const fetchMock = vi.fn<() => void>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runDeveloperAction(
        db,
        memberRequest(),
        actionInput({
          action: "repository_backfill",
          payload: { repositories: ["owner/repo"] },
        })
      )
    ).rejects.toThrow("CONNECTOR_INVOKE_SECRET_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects insecure connector targets outside local development", async () => {
    const { db } = dbWithIntegrations({
      integration: {
        configStr: '{"secret":"do-not-send"}',
        enabled: true,
        id: "integration-a",
        organizationId,
        type: "github",
      },
    });
    process.env.NODE_ENV = "production";
    const entry = connectorRegistry.getByType("github");
    if (!entry) {
      throw new Error("GitHub connector is not registered");
    }
    vi.spyOn(connectorRegistry, "getByType").mockReturnValue({
      ...entry,
      actionInvokeUrl: "http://localhost:3334/api/actions/invoke",
    });
    const fetchMock = vi.fn<() => void>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runDeveloperAction(
        db,
        memberRequest(),
        actionInput({
          action: "repository_backfill",
          payload: { repositories: ["owner/repo"] },
        })
      )
    ).rejects.toThrow("INSECURE_CONNECTOR_ACTION_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not accept an integration id in the action payload", () => {
    expect(() =>
      developerActionInputSchema.parse({
        action: "pr_match_replay",
        connectorType: "github",
        organizationId,
        payload: { entityId: "entity-a", integrationId: "integration-a" },
      })
    ).toThrow("integrationId is not accepted");
  });
});
