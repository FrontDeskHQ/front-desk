import { describe, expect, it, vi } from "vitest";

import { createLinearConnector } from "./linear";

const config = JSON.stringify({
  defaultTeamId: "team-1",
  teams: [{ id: "team-1", key: "ENG", name: "Engineering" }],
  workspaceId: "workspace-1",
  workspaceName: "Acme",
});

describe(createLinearConnector, () => {
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
});
