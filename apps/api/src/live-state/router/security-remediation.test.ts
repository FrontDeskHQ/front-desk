import { describe, expect, it, vi } from "vitest";

import labelsRoute from "./labels";
import messageRoute from "./message";
import threadsRoute from "./threads";

const widgetContext = {
  publicApiKey: { id: "public-a", ownerId: "org-a" },
  widgetIdentity: {
    keyVersion: 2,
    name: "Ada",
    organizationId: "org-a",
    userId: "customer-a",
  },
};

const invoke = async (
  handler: unknown,
  input: Record<string, unknown>,
  context: Record<string, unknown>,
  db: Record<string, unknown> = {}
) =>
  (handler as (args: unknown) => unknown)({
    db,
    req: { context, input },
  });

describe("security remediation route authorization", () => {
  it("rejects cross-customer widget thread reads", async () => {
    await expect(
      invoke(
        threadsRoute.customQueries.list.handler,
        { customerId: "customer-b", includeMessages: true },
        widgetContext
      )
    ).rejects.toThrow("UNAUTHORIZED");
  });

  it("scopes widget subscriptions to customer-owned source threads", async () => {
    const builder = {
      include: vi.fn<(value: unknown) => unknown>(),
      orderBy: vi.fn<(field: string, direction: string) => unknown>(),
    };
    builder.include.mockReturnValue(builder);
    builder.orderBy.mockReturnValue(builder);
    const thread = {
      where: vi.fn<(value: unknown) => typeof builder>(() => builder),
    };

    await expect(
      invoke(
        threadsRoute.customQueries.list.handler,
        { customerId: "customer-a", includeMessages: true },
        widgetContext,
        { thread }
      )
    ).resolves.toBe(builder);
    expect(thread.where).toHaveBeenCalledWith({
      author: { metaId: "widget:customer-a" },
      deletedAt: null,
      organizationId: "org-a",
    });
    expect(builder.include).toHaveBeenCalledWith({
      messages: { include: { author: true } },
    });
    expect(builder.orderBy).toHaveBeenCalledWith("createdAt", "desc");
  });

  it("does not let widget identities invoke workspace label mutations", async () => {
    await expect(
      invoke(
        labelsRoute.label.customMutations.create.handler,
        {
          color: "blue",
          name: "Private label",
          organizationId: "org-a",
        },
        widgetContext
      )
    ).rejects.toThrow("UNAUTHORIZED");
  });

  it("requires internal credentials for worker and connector lookups", async () => {
    await expect(
      invoke(
        threadsRoute.customQueries.byIds.handler,
        { ids: ["thread-1"] },
        {}
      )
    ).rejects.toThrow("UNAUTHORIZED");
    await expect(
      invoke(
        threadsRoute.customQueries.byExternalId.handler,
        { externalId: "external-1", organizationId: "org-a" },
        widgetContext
      )
    ).rejects.toThrow("UNAUTHORIZED");
    await expect(
      invoke(
        messageRoute.customQueries.byExternalId.handler,
        { externalMessageId: "external-message-1" },
        widgetContext
      )
    ).rejects.toThrow("UNAUTHORIZED");
  });

  it("keeps the complete worker thread shape", async () => {
    const internalThread = {
      agentRead: { draftMarkdown: "Internal draft" },
      hints: { slot: { title: "Private issue" } },
      id: "thread-1",
      inlineSuggestions: [{ text: "Internal suggestion" }],
    };
    const builder = {
      get: vi.fn<() => Promise<(typeof internalThread)[]>>(async () => [
        internalThread,
      ]),
      include: vi.fn<(value: unknown) => unknown>(),
    };
    builder.include.mockReturnValue(builder);
    const thread = {
      where: vi.fn<(value: unknown) => typeof builder>(() => builder),
    };

    await expect(
      invoke(
        threadsRoute.customQueries.byIds.handler,
        { ids: ["thread-1"] },
        { internalApiKey: true },
        { thread }
      )
    ).resolves.toStrictEqual([internalThread]);
    expect(builder.include).toHaveBeenCalledWith({
      labels: { include: { label: true } },
      messages: true,
    });
  });
});
