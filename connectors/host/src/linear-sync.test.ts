import type { LiveStateFetchClient } from "@connectors/framework/runtime";
import { describe, expect, it, vi } from "vitest";

import { buildLinearIssueFields, createLinearSync } from "./linear-sync";
import type { LinearIssue } from "./linear-sync";

const issue = (overrides: Partial<LinearIssue> = {}): LinearIssue => ({
  archivedAt: null,
  assignee: { name: "Ada" },
  canceledAt: null,
  completedAt: null,
  createdAt: "2026-09-20T12:00:00.000Z",
  creator: { name: "Grace" },
  description: "The settings page fails to load",
  id: "linear-issue-id",
  identifier: "ENG-42",
  labels: { nodes: [{ name: "bug" }] },
  number: 42,
  state: { name: "In Progress", type: "started" },
  team: { id: "team-id", key: "ENG", name: "Engineering" },
  title: "Fix settings",
  updatedAt: "2026-09-21T12:00:00.000Z",
  url: "https://linear.app/acme/issue/ENG-42/fix-settings",
  ...overrides,
});

describe(buildLinearIssueFields, () => {
  it("maps a Linear issue onto provider-neutral mirror fields", () => {
    expect(buildLinearIssueFields(issue())).toMatchObject({
      containerId: "team-id",
      containerKind: "team",
      containerLabel: "ENG",
      externalKey: "linear:linear-issue-id",
      externalRef: {
        id: "linear-issue-id",
        identifier: "ENG-42",
        teamId: "team-id",
      },
      provider: "linear",
      shortId: "ENG-42",
      state: "open",
      type: "issue",
    });
  });

  it("normalizes terminal Linear states", () => {
    expect(
      buildLinearIssueFields(
        issue({ state: { name: "Done", type: "completed" } })
      ).state
    ).toBe("closed");
    expect(
      buildLinearIssueFields(
        issue({ state: { name: "Canceled", type: "canceled" } })
      ).state
    ).toBe("closed");
  });
});

describe(createLinearSync, () => {
  it("pages all issues and soft-deletes mirror rows missing upstream", async () => {
    const upsert = vi.fn<() => Promise<string>>().mockResolvedValue("row-id");
    const softDelete = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("row-id");
    const listForIntegration = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({
        items: [
          { deletedAt: null, externalKey: "linear:missing", id: "row-1" },
        ],
        nextCursor: "row-1",
      })
      .mockResolvedValueOnce({
        items: [
          {
            deletedAt: null,
            externalKey: "linear:linear-issue-id-2",
            id: "row-2",
          },
        ],
        nextCursor: null,
      });
    const fetchClient = {
      mutate: { externalEntity: { softDelete, upsert } },
      query: {
        externalEntity: { listForIntegration },
        integration: { listByType: vi.fn<() => Promise<unknown[]>>() },
      },
    } as unknown as LiveStateFetchClient;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          credential: {
            accessToken: "token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            refreshToken: "refresh",
            scope: "read issues:create",
            tokenType: "Bearer",
            viewerId: "viewer",
          },
          organizationId: "frontdesk-org",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            issues: {
              nodes: [issue()],
              pageInfo: { endCursor: "cursor-1", hasNextPage: true },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            issues: {
              nodes: [
                issue({
                  id: "linear-issue-id-2",
                  identifier: "ENG-43",
                  number: 43,
                }),
              ],
              pageInfo: { endCursor: null, hasNextPage: false },
            },
          },
        })
      );
    const sync = createLinearSync({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client",
        clientSecret: "secret",
        connectorSecret: "connector",
      },
      fetchClient,
      fetcher,
    });

    await expect(sync.syncIntegration("integration-id")).resolves.toStrictEqual(
      {
        mirrored: 2,
      }
    );
    expect({
      inventoryPages: listForIntegration.mock.calls.length,
      upserts: upsert.mock.calls.length,
    }).toStrictEqual({ inventoryPages: 2, upserts: 2 });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: "integration-id" })
    );
    expect(listForIntegration).toHaveBeenCalledBefore(upsert);
    expect(softDelete).toHaveBeenCalledExactlyOnceWith({
      externalKey: "linear:missing",
      organizationId: "frontdesk-org",
    });
  });

  it("skips disabled integrations during reconciliation", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const fetchClient = {
      mutate: { externalEntity: {} },
      query: {
        externalEntity: {},
        integration: {
          listByType: vi
            .fn<() => Promise<unknown[]>>()
            .mockResolvedValue([{ enabled: false, id: "disabled" }]),
        },
      },
    } as unknown as LiveStateFetchClient;
    const sync = createLinearSync({
      environment: {
        apiBaseUrl: "https://api.frontdesk.test",
        clientId: "client",
        clientSecret: "secret",
        connectorSecret: "connector",
      },
      fetchClient,
      fetcher,
    });

    await sync.syncAll();

    expect(fetcher).not.toHaveBeenCalled();
  });
});
