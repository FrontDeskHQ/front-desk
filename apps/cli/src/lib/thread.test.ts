import { describe, expect, it } from "vitest";

import { readThread, resolveReplyChannel } from "./thread";
import type { ResolvedThread } from "./thread";

const resolvedThread = {
  organizationId: "org-1",
  orgSlug: "acme",
  thread: {
    authorId: "customer-1",
    externalOrigin: "slack",
    id: "thread-1",
    messages: [
      {
        author: { id: "customer-1", name: "Casey", userId: null },
        authorId: "customer-1",
        content: JSON.stringify([
          { content: [{ text: "Hello", type: "text" }], type: "paragraph" },
        ]),
        createdAt: new Date("2026-08-06T12:00:00.000Z"),
        externalMessageId: null,
        id: "01-message-customer",
        insertionSequence: 1,
        isBackfill: false,
        markedAsAnswer: false,
        origin: "slack",
        threadId: "thread-1",
      },
      {
        author: { id: "agent-1", name: "Alex", userId: "user-1" },
        authorId: "agent-1",
        content: JSON.stringify([
          {
            content: [{ text: "I can help", type: "text" }],
            type: "paragraph",
          },
        ]),
        createdAt: new Date("2026-08-06T12:01:00.000Z"),
        externalMessageId: null,
        id: "02-message-agent",
        insertionSequence: 2,
        isBackfill: false,
        markedAsAnswer: false,
        origin: null,
        threadId: "thread-1",
      },
    ],
    name: "Export failed",
    organization: { slug: "acme" },
    organizationId: "org-1",
    shortId: 42,
    status: 0,
  },
} as unknown as ResolvedThread;

describe("thread transcript helpers", () => {
  it("normalizes roles and supports incremental cursors", () => {
    const initial = readThread(resolvedThread);
    expect(initial.cursor).toBe("02-message-agent");
    expect(initial.messages).toHaveLength(2);
    expect(initial.messages[0]).toMatchObject({ role: "customer" });
    expect(initial.messages[0]?.content).toBe("Hello");
    expect(initial.messages[1]).toMatchObject({ role: "frontdesk" });
  });

  it("supports incremental cursors", () => {
    const incremental = readThread(resolvedThread, "01-message-customer");
    expect(incremental.messages).toHaveLength(1);
    expect(incremental.messages[0]?.role).toBe("frontdesk");
  });

  it("orders by provider time while using server sequences as cursors", () => {
    const lateHistoricalMessage = {
      ...resolvedThread.thread.messages[0],
      createdAt: new Date("2026-08-06T11:59:00.000Z"),
      id: "00-message-late",
      insertionSequence: 3,
    };
    const importedThread = {
      ...resolvedThread,
      thread: {
        ...resolvedThread.thread,
        messages: [...resolvedThread.thread.messages, lateHistoricalMessage],
      },
    } as ResolvedThread;

    const initial = readThread(importedThread);
    expect(initial.messages.map((message) => message.id)).toStrictEqual([
      "00-message-late",
      "01-message-customer",
      "02-message-agent",
    ]);
    expect(initial.cursor).toBe("00-message-late");

    const incremental = readThread(importedThread, "02-message-agent");
    expect(incremental.messages.map((message) => message.id)).toStrictEqual([
      "00-message-late",
    ]);
    expect(
      readThread(importedThread, "00-message-late").messages
    ).toStrictEqual([]);
  });

  it("falls back to transcript positions for mixed legacy sequences", () => {
    const mixedThread = {
      ...resolvedThread,
      thread: {
        ...resolvedThread.thread,
        messages: [
          resolvedThread.thread.messages[0],
          resolvedThread.thread.messages[1],
          {
            ...resolvedThread.thread.messages[1],
            createdAt: new Date("2026-08-06T12:02:00.000Z"),
            id: "legacy-message",
            insertionSequence: null,
          },
          {
            ...resolvedThread.thread.messages[1],
            createdAt: new Date("2026-08-06T12:03:00.000Z"),
            id: "new-message",
            insertionSequence: 3,
          },
        ],
      },
    } as ResolvedThread;

    const incremental = readThread(mixedThread, "01-message-customer");
    expect(incremental.messages.map((message) => message.id)).toStrictEqual([
      "02-message-agent",
      "legacy-message",
      "new-message",
    ]);
    expect(incremental.cursor).toBe("new-message");
  });

  it("rejects a cursor from another thread", () => {
    expect(() => readThread(resolvedThread, "missing")).toThrow(
      "Message cursor not found"
    );
  });

  it("inherits origins and defaults legacy threads to portal", () => {
    expect(resolveReplyChannel("slack")).toBe("slack");
    expect(resolveReplyChannel(null)).toBe("portal");
    expect(resolveReplyChannel(null, "widget")).toBe("widget");
    expect(() => resolveReplyChannel("slack", "portal")).toThrow(
      "THREAD_ORIGIN_MISMATCH"
    );
  });
});
