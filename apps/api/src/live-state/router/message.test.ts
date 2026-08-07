import { describe, expect, it, vi } from "vitest";

import messageRoute from "./message";

type CustomerChannel = "discord" | "portal" | "slack" | "widget";

type MutationHandler = (args: {
  db: unknown;
  req: {
    context?: { internalApiKey?: unknown };
    input: {
      content: string;
      organizationId: string;
      origin: CustomerChannel;
      threadId: string;
    };
  };
}) => Promise<unknown>;

const createAsThreadAuthor = (
  messageRoute as unknown as {
    customMutations: Record<string, { handler: MutationHandler }>;
  }
).customMutations.createAsThreadAuthor.handler;

const thread = (externalOrigin: string | null) => ({
  authorId: "author-1",
  externalOrigin,
  id: "thread-1",
  organizationId: "org-1",
});

const createDb = (threadRow: ReturnType<typeof thread>) => {
  const insert = vi.fn<() => unknown>();
  const update = vi.fn<() => unknown>();
  const returnedMessage = {
    author: { id: "author-1", name: "Casey", userId: null },
    authorId: "author-1",
    content: "stored-content",
    createdAt: new Date(),
    externalMessageId: "fd:message-1",
    id: "message-1",
    isBackfill: false,
    markedAsAnswer: false,
    origin: "slack",
    threadId: "thread-1",
  };
  const db = {
    message: {
      one: vi.fn<() => unknown>(() => ({
        include: vi.fn<() => unknown>(() => ({
          get: vi.fn<() => Promise<typeof returnedMessage>>(
            async () => returnedMessage
          ),
        })),
      })),
    },
    thread: {
      one: vi.fn<() => unknown>(() => ({
        get: vi.fn<() => Promise<typeof threadRow>>(async () => threadRow),
      })),
    },
    transaction: vi.fn<
      (callback: (args: unknown) => Promise<void>) => Promise<void>
    >(async (callback) =>
      callback({
        trx: {
          message: { insert },
          thread: { update },
        },
      })
    ),
  };

  return { db, insert, update, returnedMessage };
};

const input = (origin: CustomerChannel = "slack") => ({
  content: "Follow-up",
  organizationId: "org-1",
  origin,
  threadId: "thread-1",
});

describe("message.createAsThreadAuthor", () => {
  it("requires the internal key before reading the thread", async () => {
    const { db } = createDb(thread("slack"));

    await expect(
      createAsThreadAuthor({
        db,
        req: { input: input() },
      })
    ).rejects.toThrow("UNAUTHORIZED");
    expect(db.thread.one).not.toHaveBeenCalled();
  });

  it("reuses the original author and marks the simulation inbound", async () => {
    const { db, insert, update, returnedMessage } = createDb(thread("slack"));

    const result = await createAsThreadAuthor({
      db,
      req: { context: { internalApiKey: "dev-key" }, input: input() },
    });

    expect(result).toBe(returnedMessage);
    expect(update).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: "author-1",
        externalMessageId: expect.stringMatching(/^fd:/),
        isBackfill: false,
        origin: "slack",
        threadId: "thread-1",
      })
    );
  });

  it("persists an origin for a legacy originless thread", async () => {
    const { db, insert, update } = createDb(thread(null));

    await createAsThreadAuthor({
      db,
      req: {
        context: { internalApiKey: "dev-key" },
        input: input("widget"),
      },
    });

    expect(update).toHaveBeenCalledWith("thread-1", {
      externalOrigin: "widget",
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "widget" })
    );
  });

  it("rejects changing a known origin", async () => {
    const { db, insert, update } = createDb(thread("slack"));

    await expect(
      createAsThreadAuthor({
        db,
        req: {
          context: { internalApiKey: "dev-key" },
          input: input("portal"),
        },
      })
    ).rejects.toThrow("THREAD_ORIGIN_MISMATCH");
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
