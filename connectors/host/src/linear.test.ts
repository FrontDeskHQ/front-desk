import { describe, expect, it, vi } from "vitest";

import { createLinearConnector } from "./linear";

const config = JSON.stringify({
  defaultTeamId: "team-1",
  teams: [{ id: "team-1", key: "ENG", name: "Engineering" }],
  workspaceId: "workspace-1",
  workspaceName: "Acme",
});

describe(createLinearConnector, () => {
  const environment = {
    apiBaseUrl: "https://api.frontdesk.test",
    clientId: "client-id",
    clientSecret: "client-secret",
    connectorSecret: "connector-secret",
  };

  const outcomePayload = {
    entity: {
      container: { externalId: "team-1", kind: "team", label: "ENG" },
      externalKey: "linear:issue-id",
      externalRef: { id: "issue-id" },
      shortId: "ENG-42",
      url: "https://linear.app/acme/issue/ENG-42/broken-settings",
    },
  };

  const readOutcome = async (
    state: { name: string; type: string },
    relations: unknown[] = [],
    relationPages: unknown[][] = []
  ) => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(
      Response.json({
        credential: {
          accessToken: "access-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
          refreshToken: "refresh-token",
          scope: "read issues:create",
          tokenType: "Bearer",
          viewerId: "viewer-id",
        },
        organizationId: "organization-id",
      })
    );
    const pages = [
      {
        nodes: relations,
        pageInfo: {
          endCursor: relationPages.length > 0 ? "cursor-1" : null,
          hasNextPage: relationPages.length > 0,
        },
      },
      ...relationPages.map((nodes, index) => ({
        nodes,
        pageInfo: {
          endCursor:
            index < relationPages.length - 1 ? `cursor-${index + 2}` : null,
          hasNextPage: index < relationPages.length - 1,
        },
      })),
    ];
    for (const page of pages) {
      fetcher.mockResolvedValueOnce(
        Response.json({
          data: {
            issue: {
              id: "issue-id",
              identifier: "ENG-42",
              relations: page,
              state,
              team: { id: "team-1", key: "ENG", name: "Engineering" },
              title: "Broken settings",
              url: "https://linear.app/acme/issue/ENG-42/broken-settings",
            },
          },
        })
      );
    }
    const connector = createLinearConnector({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        connectorSecret: "connector-secret",
      },
      fetcher,
    });
    return connector.invoke({
      capability: "issue-tracker",
      config,
      integrationId: "integration-id",
      method: "readOutcome",
      payload: outcomePayload,
    });
  };

  it("creates only a title, description, and team and returns a neutral issue", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "access-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "refresh-token",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer-id",
          },
          organizationId: "organization-id",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            issueCreate: {
              issue: {
                description: "Details",
                id: "issue-id",
                identifier: "ENG-42",
                state: { type: "backlog" },
                team: { id: "team-1", key: "ENG", name: "Engineering" },
                title: "Broken settings",
                url: "https://linear.app/acme/issue/ENG-42/broken-settings",
              },
              success: true,
            },
          },
        })
      );
    const connector = createLinearConnector({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        connectorSecret: "connector-secret",
      },
      fetcher,
    });

    const result = await connector.invoke({
      capability: "issue-tracker",
      config,
      integrationId: "integration-id",
      method: "create",
      payload: {
        body: "Details",
        target: { teamId: "team-1" },
        title: "Broken settings",
      },
    });

    expect(result.status).toBe(200);
    expect(result.body).toStrictEqual({
      entity: {
        body: "Details",
        container: { externalId: "team-1", kind: "team", label: "ENG" },
        externalRef: {
          id: "issue-id",
          identifier: "ENG-42",
          teamId: "team-1",
        },
        id: "linear:issue-id",
        label: "ENG-42",
        shortId: "ENG-42",
        state: "backlog",
        title: "Broken settings",
        url: "https://linear.app/acme/issue/ENG-42/broken-settings",
      },
    });
    const graphqlBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(graphqlBody.variables).toStrictEqual({
      input: {
        description: "Details",
        teamId: "team-1",
        title: "Broken settings",
      },
    });
  });

  it("probes the live credential against Linear", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "access-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "refresh-token",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer-id",
          },
          organizationId: "organization-id",
        })
      )
      .mockResolvedValueOnce(
        Response.json({ data: { viewer: { id: "viewer-id" } } })
      );
    const connector = createLinearConnector({ environment, fetcher });

    await expect(
      connector.probe(config, "integration-id")
    ).resolves.toStrictEqual({ live: true });
    expect({
      calls: fetcher.mock.calls.length,
      method: fetcher.mock.calls[1]?.[1]?.method,
      query: JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body ?? "{}")).query,
      url: fetcher.mock.calls[1]?.[0],
      authorization: new Headers(fetcher.mock.calls[1]?.[1]?.headers).get(
        "authorization"
      ),
    }).toStrictEqual({
      authorization: "Bearer access-token",
      calls: 2,
      method: "POST",
      query: "query FrontDeskViewerProbe { viewer { id } }",
      url: "https://api.linear.app/graphql",
    });
  });

  it("does not probe with missing or invalid Linear configuration", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const connector = createLinearConnector({ environment, fetcher });

    await expect(
      connector.probe(null, "integration-id")
    ).resolves.toStrictEqual({ live: false });
    await expect(
      connector.probe("{invalid", "integration-id")
    ).resolves.toStrictEqual({ live: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("revokes the current access token on disconnect", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "access-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "refresh-token",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer-id",
          },
          organizationId: "organization-id",
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const connector = createLinearConnector({ environment, fetcher });

    await expect(
      connector.invoke({
        capability: "issue-tracker",
        config,
        integrationId: "integration-id",
        method: "disconnect",
        payload: {},
      })
    ).resolves.toStrictEqual({ body: { ok: true }, status: 200 });
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://api.linear.app/oauth/revoke"
    );
    expect(String(fetcher.mock.calls[1]?.[1]?.body)).toBe(
      "token=access-token&token_type_hint=access_token"
    );
  });

  it("treats a missing credential as an already-revoked disconnect", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const connector = createLinearConnector({ environment, fetcher });

    await expect(
      connector.invoke({
        capability: "issue-tracker",
        config,
        integrationId: "integration-id",
        method: "disconnect",
        payload: {},
      })
    ).resolves.toStrictEqual({
      body: { alreadyRevoked: true, ok: true },
      status: 200,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects a team outside the connected workspace config", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const connector = createLinearConnector({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        connectorSecret: "connector-secret",
      },
      fetcher,
    });

    const result = await connector.invoke({
      capability: "issue-tracker",
      config,
      integrationId: "integration-id",
      method: "create",
      payload: {
        body: "Details",
        target: { teamId: "foreign-team" },
        title: "Broken settings",
      },
    });

    expect(result).toStrictEqual({
      body: { error: "REPOSITORY_NOT_CONNECTED" },
      status: 400,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps a provider-declared create failure to a bad gateway", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "access-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "refresh-token",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer-id",
          },
          organizationId: "organization-id",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { issueCreate: { issue: null, success: false } },
        })
      );
    const connector = createLinearConnector({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        connectorSecret: "connector-secret",
      },
      fetcher,
    });

    const result = await connector.invoke({
      capability: "issue-tracker",
      config,
      integrationId: "integration-id",
      method: "create",
      payload: {
        body: "Details",
        target: { teamId: "team-1" },
        title: "Broken settings",
      },
    });

    expect(result).toStrictEqual({
      body: { error: "LINEAR_CREATE_FAILED" },
      status: 502,
    });
  });

  it("maps a GraphQL error response to a bad gateway", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "access-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "refresh-token",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer-id",
          },
          organizationId: "organization-id",
        })
      )
      .mockResolvedValueOnce(
        Response.json({ errors: [{ message: "denied" }] })
      );
    const connector = createLinearConnector({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        connectorSecret: "connector-secret",
      },
      fetcher,
    });

    const result = await connector.invoke({
      capability: "issue-tracker",
      config,
      integrationId: "integration-id",
      method: "create",
      payload: {
        body: "Details",
        target: { teamId: "team-1" },
        title: "Broken settings",
      },
    });

    expect(result).toStrictEqual({
      body: { error: "LINEAR_CREATE_FAILED" },
      status: 502,
    });
  });

  it("returns an unknown outcome without retrying an ambiguous timeout", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "access-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "refresh-token",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer-id",
          },
          organizationId: "organization-id",
        })
      )
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    const connector = createLinearConnector({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        connectorSecret: "connector-secret",
      },
      fetcher,
    });

    const result = await connector.invoke({
      capability: "issue-tracker",
      config,
      integrationId: "integration-id",
      method: "create",
      payload: {
        body: "Details",
        target: { teamId: "team-1" },
        title: "Broken settings",
      },
    });

    expect(result).toStrictEqual({
      body: { error: "CREATE_OUTCOME_UNKNOWN" },
      status: 504,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("maps completed and canceled workflow categories", async () => {
    const completed = await readOutcome({ name: "Done", type: "completed" });
    const canceled = await readOutcome({ name: "Canceled", type: "canceled" });

    expect(completed.body).toMatchObject({
      finished: true,
      outcome: "delivered",
      successor: null,
    });
    expect(canceled.body).toMatchObject({
      finished: true,
      outcome: "declined",
      successor: null,
    });
  });

  it("maps a duplicate only when Linear supplies its canonical successor", async () => {
    const result = await readOutcome(
      { name: "Duplicate", type: "duplicate" },
      [],
      [
        [
          {
            relatedIssue: {
              id: "canonical-id",
              identifier: "ENG-7",
              state: { name: "In Progress", type: "started" },
              team: { id: "team-1", key: "ENG", name: "Engineering" },
              title: "Canonical issue",
              url: "https://linear.app/acme/issue/ENG-7/canonical-issue",
            },
            type: "duplicate",
          },
        ],
      ]
    );

    expect(result.body).toMatchObject({
      outcome: "superseded",
      successor: {
        entity: {
          externalKey: "linear:canonical-id",
          shortId: "ENG-7",
        },
        finished: false,
        outcome: "unknown",
      },
    });
  });

  it("bounds outcome reads and returns a timeout outcome", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "access-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "refresh-token",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer-id",
          },
          organizationId: "organization-id",
        })
      )
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    const connector = createLinearConnector({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        connectorSecret: "connector-secret",
      },
      fetcher,
    });

    const result = await connector.invoke({
      capability: "issue-tracker",
      config,
      integrationId: "integration-id",
      method: "readOutcome",
      payload: outcomePayload,
    });

    expect(result).toStrictEqual({
      body: { error: "LINEAR_OUTCOME_READ_TIMEOUT" },
      status: 504,
    });
  });
});
