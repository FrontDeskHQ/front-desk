import type { Storage } from "@live-state/sync/server";
import { describe, expect, it, vi } from "vitest";

import { schema } from "../live-state/schema";
import {
  syncCustomerAuthor,
  syncCustomerMessage,
  syncCustomerThread,
  toCustomerMessage,
  toCustomerThread,
} from "./customer-response";

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
      "deletedAt",
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

  it("hides a mirrored thread when its source author is no longer widget-owned", async () => {
    const update = vi.fn(async () => ({}));
    const db = {
      findOne: vi.fn(async (model: unknown) => {
        if (model === schema.thread) {
          return { authorId: "author-1", id: "thread-1" };
        }
        if (model === schema.author) {
          return { metaId: "discord:user-1" };
        }
        if (model === schema.customerThread) {
          return { deletedAt: null, id: "thread-1" };
        }
      }),
      update,
    } as unknown as Storage;

    await expect(syncCustomerThread(db, "thread-1")).resolves.toBeFalsy();
    expect(update).toHaveBeenCalledWith(
      schema.customerThread,
      "thread-1",
      { deletedAt: expect.any(Date) }
    );
  });

  it("hides a mirrored message after it leaves a customer thread", async () => {
    const update = vi.fn(async () => ({}));
    const db = {
      findOne: vi.fn(async (model: unknown) => {
        if (model === schema.message) {
          return { id: "message-1", threadId: "thread-2" };
        }
        if (model === schema.customerMessage) {
          return { deletedAt: null, id: "message-1" };
        }
      }),
      update,
    } as unknown as Storage;

    await expect(syncCustomerMessage(db, "message-1")).resolves.toBeFalsy();
    expect(update).toHaveBeenCalledWith(
      schema.customerMessage,
      "message-1",
      { deletedAt: expect.any(Date) }
    );
  });

  it("recovers when a concurrent hook wins a projection insert", async () => {
    const insert = vi.fn(async () => {
      throw new Error("duplicate key");
    });
    const update = vi.fn(async () => ({}));
    let customerAuthorReads = 0;
    const db = {
      findOne: vi.fn(async (model: unknown) => {
        if (model === schema.author) {
          return { id: "author-1", name: "Ada" };
        }
        if (model === schema.customerAuthor) {
          customerAuthorReads += 1;
          return customerAuthorReads === 1
            ? undefined
            : { id: "author-1", name: "Old name" };
        }
      }),
      insert,
      transaction: async (handler: (input: { trx: Storage }) => unknown) =>
        handler({ trx: db as unknown as Storage }),
      update,
    } as unknown as Storage;

    await expect(syncCustomerAuthor(db, "author-1")).resolves.toBeTruthy();
    expect(update).toHaveBeenCalledWith(schema.customerAuthor, "author-1", {
      name: "Ada",
    });
  });
});
