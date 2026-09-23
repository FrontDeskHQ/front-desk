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
  const softDelete = vi.fn<() => Promise<string>>().mockResolvedValue("row");
  const syncIssue = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const fetchClient = {
    mutate: { externalEntity: { softDelete } },
    query: {
      integration: {
        listByType: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([
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
        ]),
      },
    },
  } as unknown as LiveStateFetchClient;
  return { fetchClient, softDelete, syncIssue };
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

  it("soft-deletes every matching organization on remove", async () => {
    const dependencies = webhookDependencies();

    await handleLinearWebhook(event({ action: "remove" }), dependencies);

    expect(dependencies.softDelete).toHaveBeenCalledTimes(2);
    expect(dependencies.softDelete).toHaveBeenCalledWith({
      externalKey: "linear:issue-1",
      organizationId: "organization-1",
    });
    expect(dependencies.softDelete).toHaveBeenCalledWith({
      externalKey: "linear:issue-1",
      organizationId: "organization-2",
    });
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
    expect(dependencies.softDelete).not.toHaveBeenCalled();
  });
});
