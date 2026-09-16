import { describe, expect, it } from "vitest";

import { schema } from "../live-state/schema";
import { toCustomerMessage, toCustomerThread } from "./customer-response";

describe("widget customer response allowlist", () => {
  it("uses allowlisted models for reactive subscription data", () => {
    expect(Object.keys(schema.customerThread.fields).sort()).toStrictEqual([
      "authorId",
      "createdAt",
      "customerId",
      "deletedAt",
      "id",
      "name",
      "organizationId",
      "status",
    ]);
    expect(Object.keys(schema.customerMessage.fields).sort()).toStrictEqual([
      "authorId",
      "content",
      "createdAt",
      "id",
      "markedAsAnswer",
      "origin",
      "threadId",
    ]);
  });

  it("keeps conversation fields and removes populated internal thread data", () => {
    const response = toCustomerThread({
      agentRead: {
        draftMarkdown: "private draft",
        reasoning: "private reasoning",
      },
      assignedUserId: "agent-1",
      author: {
        email: "private@example.com",
        id: "author-1",
        metaId: "widget:customer-1",
        name: "Ada",
        userId: "customer-1",
      },
      authorId: "author-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      customerId: "customer-1",
      deletedAt: null,
      externalMetadataStr: "private metadata",
      hints: { slot: { title: "Private repository" } },
      id: "thread-1",
      inlineSuggestions: [{ text: "private suggestion" }],
      messages: [],
      name: "Help",
      organizationId: "org-a",
      status: 1,
    });

    expect(response).toMatchObject({
      author: { id: "author-1", name: "Ada" },
      customerId: "customer-1",
      id: "thread-1",
      name: "Help",
      status: 1,
    });
    expect(Object.keys(response).sort()).toStrictEqual([
      "author",
      "authorId",
      "createdAt",
      "customerId",
      "deletedAt",
      "id",
      "messages",
      "name",
      "organizationId",
      "status",
    ]);
    expect(response.author).toStrictEqual({ id: "author-1", name: "Ada" });
  });

  it("keeps sent message content and removes connector-only fields", () => {
    const response = toCustomerMessage({
      author: { id: "author-1", metaId: "private", name: "Ada" },
      authorId: "author-1",
      content: "Sent reply",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      externalMessageId: "external-1",
      id: "message-1",
      isBackfill: true,
      markedAsAnswer: false,
      origin: "widget",
      threadId: "thread-1",
    });

    expect(response.content).toBe("Sent reply");
    expect(response).not.toHaveProperty("externalMessageId");
    expect(response).not.toHaveProperty("isBackfill");
    expect(response.author).toStrictEqual({ id: "author-1", name: "Ada" });
  });
});
