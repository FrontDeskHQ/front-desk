import { beforeEach, describe, expect, it, vi } from "vitest";

import { schema } from "../live-state/schema";
import { connectorRegistry } from "./connector-registry";
import { resolveEffectiveDefaultIssueTarget } from "./issue-tracker";

const organizationId = "org-a";
const integrationId = "integration-a";

const githubRepo = {
  fullName: "acme/widgets",
  name: "widgets",
  owner: "acme",
};

const savedTarget = {
  integrationId,
  label: "acme/saved",
  target: { owner: "acme", repo: "saved" },
};

const makeDb = (integrations: Record<string, unknown>[]) => ({
  find: vi.fn<
    (table: unknown, options: unknown) => Promise<Record<string, unknown>>
  >(async (_table: unknown, _options: unknown) => {
    const byId: Record<string, unknown> = {};
    for (const row of integrations) {
      byId[String((row as { id: string }).id)] = row;
    }
    return byId;
  }),
});

describe(resolveEffectiveDefaultIssueTarget, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the saved target when one is set", async () => {
    const db = makeDb([]);

    await expect(
      resolveEffectiveDefaultIssueTarget(db, organizationId, {
        defaultIssueTarget: savedTarget,
      })
    ).resolves.toStrictEqual(savedTarget);
    expect(db.find).not.toHaveBeenCalled();
  });

  it("returns null when no issue tracker resolves", async () => {
    const db = makeDb([]);

    await expect(
      resolveEffectiveDefaultIssueTarget(db, organizationId, {})
    ).resolves.toBeNull();
  });

  it("returns null for a Linear tracker without teams", async () => {
    const entry = connectorRegistry.getByType("github");
    if (!entry) {
      throw new Error("GitHub connector is not registered");
    }
    vi.spyOn(connectorRegistry, "providersOf").mockReturnValue([
      {
        invokeUrl: entry.invokeUrl,
        manifest: {
          capabilities: ["issue-tracker"],
          type: "linear",
        },
      },
    ] as ReturnType<typeof connectorRegistry.providersOf>);
    vi.spyOn(connectorRegistry, "getByType").mockReturnValue({
      ...entry,
      manifest: { ...entry.manifest, type: "linear" },
    });

    const db = makeDb([
      {
        configStr: JSON.stringify({ teams: [], workspaceId: "workspace-1" }),
        enabled: true,
        id: integrationId,
        organization: { id: organizationId, settings: {}, slug: "acme" },
        organizationId,
        type: "linear",
      },
    ]);

    await expect(
      resolveEffectiveDefaultIssueTarget(db, organizationId, {})
    ).resolves.toBeNull();
  });

  it("uses the selected Linear team and pins its integration", async () => {
    const entry = connectorRegistry.getByType("github");
    if (!entry) throw new Error("GitHub connector is not registered");
    vi.spyOn(connectorRegistry, "providersOf").mockReturnValue([
      {
        invokeUrl: entry.invokeUrl,
        manifest: { capabilities: ["issue-tracker"], type: "linear" },
      },
    ] as ReturnType<typeof connectorRegistry.providersOf>);
    vi.spyOn(connectorRegistry, "getByType").mockReturnValue({
      ...entry,
      manifest: { ...entry.manifest, type: "linear" },
    });
    const db = makeDb([
      {
        configStr: JSON.stringify({
          defaultTeamId: "team-2",
          teams: [
            { id: "team-1", key: "ENG", name: "Engineering" },
            { id: "team-2", key: "APP", name: "Applications" },
          ],
          workspaceId: "workspace-1",
        }),
        enabled: true,
        id: integrationId,
        organization: { id: organizationId, settings: {}, slug: "acme" },
        organizationId,
        type: "linear",
      },
    ]);

    await expect(
      resolveEffectiveDefaultIssueTarget(db, organizationId, {})
    ).resolves.toStrictEqual({
      integrationId,
      label: "APP — Applications",
      target: { teamId: "team-2" },
    });
  });

  it("returns null when GitHub config JSON is invalid", async () => {
    const db = makeDb([
      {
        configStr: "{not-json",
        enabled: true,
        id: integrationId,
        organization: { id: organizationId, settings: {}, slug: "acme" },
        organizationId,
        type: "github",
      },
    ]);

    await expect(
      resolveEffectiveDefaultIssueTarget(db, organizationId, {})
    ).resolves.toBeNull();
  });

  it("returns null when GitHub configuration has no repositories", async () => {
    const db = makeDb([
      {
        configStr: JSON.stringify({
          installationId: 1,
          repos: [],
        }),
        enabled: true,
        id: integrationId,
        organization: { id: organizationId, settings: {}, slug: "acme" },
        organizationId,
        type: "github",
      },
    ]);

    await expect(
      resolveEffectiveDefaultIssueTarget(db, organizationId, {})
    ).resolves.toBeNull();
  });

  it("falls back to the first GitHub repository and pins its integration", async () => {
    const db = makeDb([
      {
        configStr: JSON.stringify({
          installationId: 1,
          repos: [
            githubRepo,
            { fullName: "acme/other", name: "other", owner: "acme" },
          ],
        }),
        enabled: true,
        id: integrationId,
        organization: { id: organizationId, settings: {}, slug: "acme" },
        organizationId,
        type: "github",
      },
    ]);

    await expect(
      resolveEffectiveDefaultIssueTarget(db, organizationId, {})
    ).resolves.toStrictEqual({
      integrationId,
      label: githubRepo.fullName,
      target: { owner: githubRepo.owner, repo: githubRepo.name },
    });
    expect(db.find).toHaveBeenCalledWith(
      schema.integration,
      expect.objectContaining({
        where: { enabled: true, organizationId },
      })
    );
  });
});
