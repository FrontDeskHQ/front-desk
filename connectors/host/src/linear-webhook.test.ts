import { createHmac } from "node:crypto";

import type { LiveStateFetchClient } from "@connectors/framework/runtime";
import { describe, expect, it, vi } from "vitest";

import { handleLinearWebhook, verifyLinearWebhook } from "./linear-webhook";

describe(verifyLinearWebhook, () => {
  it("accepts only the HMAC of the exact raw request body", () => {
    const body = JSON.stringify({ action: "update", type: "Issue" });
    const signature = createHmac("sha256", "secret").update(body).digest("hex");

    expect(verifyLinearWebhook(body, signature, "secret")).toBeTruthy();
    expect(verifyLinearWebhook(`${body}\n`, signature, "secret")).toBeFalsy();
    expect(
      verifyLinearWebhook(body, `${signature}not-hex`, "secret")
    ).toBeFalsy();
  });
});

const event = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    action: "update",
    data: { id: "issue-1" },
    organizationId: "workspace-1",
    type: "Issue",
    ...overrides,
  });

const webhookDependencies = () => {
  const syncIssue = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const integrations = [
    {
      configStr: JSON.stringify({ workspaceId: "workspace-1" }),
      enabled: true,
      id: "integration-1",
      organizationId: "organization-1",
    },
    {
      configStr: JSON.stringify({ workspaceId: "workspace-1" }),
      enabled: true,
      id: "integration-2",
      organizationId: "organization-2",
    },
    {
      configStr: JSON.stringify({ workspaceId: "workspace-1" }),
      enabled: false,
      id: "disabled",
      organizationId: "organization-3",
    },
  ];
  const fetchClient = {
    query: {
      integration: {
        byId: vi
          .fn<(input: { id: string }) => Promise<unknown>>()
          .mockImplementation(async ({ id }) =>
            integrations.find((integration) => integration.id === id)
          ),
        listByType: vi
          .fn<() => Promise<unknown[]>>()
          .mockResolvedValue(integrations),
      },
    },
  } as unknown as LiveStateFetchClient;
  return {
    byId: fetchClient.query.integration.byId,
    fetchClient,
    syncIssue,
  };
};

describe(handleLinearWebhook, () => {
  it("syncs every enabled integration connected to the workspace", async () => {
    const dependencies = webhookDependencies();

    await handleLinearWebhook(event(), dependencies);

    expect(dependencies.syncIssue).toHaveBeenCalledTimes(2);
    expect(dependencies.syncIssue).toHaveBeenCalledWith(
      "integration-1",
      "issue-1"
    );
    expect(dependencies.syncIssue).toHaveBeenCalledWith(
      "integration-2",
      "issue-1"
    );
  });

  it("authoritatively re-syncs every matching integration on remove", async () => {
    const dependencies = webhookDependencies();

    await handleLinearWebhook(event({ action: "remove" }), dependencies);

    expect(dependencies.syncIssue).toHaveBeenCalledTimes(2);
  });

  it("skips a remove when the authoritative integration is no longer live", async () => {
    const dependencies = webhookDependencies();
    vi.mocked(dependencies.byId).mockResolvedValue(undefined);

    await handleLinearWebhook(event({ action: "remove" }), dependencies);

    expect(dependencies.syncIssue).not.toHaveBeenCalled();
  });

  it("acknowledges unrelated event types and unknown workspaces", async () => {
    const dependencies = webhookDependencies();

    await expect(
      handleLinearWebhook(event({ type: "Comment" }), dependencies)
    ).resolves.toBeUndefined();
    await expect(
      handleLinearWebhook(
        event({ organizationId: "unknown-workspace" }),
        dependencies
      )
    ).resolves.toBeUndefined();
    expect(dependencies.syncIssue).not.toHaveBeenCalled();
  });
});
