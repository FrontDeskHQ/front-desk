import type { Storage } from "@live-state/sync/server";

import { schema } from "../live-state/schema";

const isWidgetAuthor = (author: { metaId: string | null }): boolean =>
  author.metaId?.startsWith("widget:") === true;

const upsert = async <T extends { id: string }>(
  db: Storage,
  model: (typeof schema)[keyof typeof schema],
  value: T
): Promise<void> => {
  const existing = await db.findOne(model, value.id);
  if (existing) {
    const { id, ...fields } = value;
    await db.update(model, id, fields);
    return;
  }

  try {
    // Isolate a possible unique-key conflict in its own transaction/savepoint.
    // PostgreSQL will otherwise leave the caller's transaction aborted before
    // we can re-read the concurrently inserted row.
    await db.transaction(async ({ trx }) => {
      await trx.insert(model, value);
    });
  } catch (error) {
    // Another lifecycle hook may have inserted the projection after our read.
    // Only treat the failure as that race when the row now exists.
    const concurrent = await db.findOne(model, value.id);
    if (!concurrent) {
      throw error;
    }

    const { id, ...fields } = value;
    await db.update(model, id, fields);
  }
};

export const syncCustomerAuthor = async (
  db: Storage,
  authorId: string
): Promise<boolean> => {
  const author = await db.findOne(schema.author, authorId);
  if (!author) {
    return false;
  }

  await upsert(db, schema.customerAuthor, {
    id: author.id,
    name: author.name,
  });
  return true;
};

export const syncCustomerThread = async (
  db: Storage,
  threadId: string
): Promise<boolean> => {
  const thread = await db.findOne(schema.thread, threadId);
  if (!thread) {
    return false;
  }

  const existing = await db.findOne(schema.customerThread, thread.id);
  const author = await db.findOne(schema.author, thread.authorId);
  if (!author || !isWidgetAuthor(author) || !author.metaId) {
    if (existing && existing.deletedAt === null) {
      await db.update(schema.customerThread, thread.id, {
        deletedAt: new Date(),
      });
    }
    return false;
  }

  await syncCustomerAuthor(db, author.id);
  await upsert(db, schema.customerThread, {
    authorId: thread.authorId,
    createdAt: thread.createdAt,
    customerId: author.metaId.slice("widget:".length),
    deletedAt: thread.deletedAt,
    id: thread.id,
    name: thread.name,
    organizationId: thread.organizationId,
    status: thread.status,
  });

  if (existing && existing.deletedAt !== null && thread.deletedAt === null) {
    const messages = await db.find(schema.message, {
      where: { threadId: thread.id },
    });
    for (const message of messages) {
      await syncCustomerMessage(db, message.id);
    }
  }
  return true;
};

export const syncCustomerMessage = async (
  db: Storage,
  messageId: string
): Promise<boolean> => {
  const message = await db.findOne(schema.message, messageId);
  if (!message) {
    return false;
  }

  const customerThread = await db.findOne(
    schema.customerThread,
    message.threadId
  );
  if (!customerThread || customerThread.deletedAt !== null) {
    const existing = await db.findOne(schema.customerMessage, message.id);
    if (existing && existing.deletedAt === null) {
      await db.update(schema.customerMessage, message.id, {
        deletedAt: new Date(),
      });
    }
    return false;
  }

  if (!(await syncCustomerAuthor(db, message.authorId))) {
    return false;
  }

  await upsert(db, schema.customerMessage, {
    authorId: message.authorId,
    content: message.content,
    createdAt: message.createdAt,
    deletedAt: null,
    id: message.id,
    markedAsAnswer: message.markedAsAnswer,
    origin: message.origin,
    threadId: message.threadId,
  });
  return true;
};

export const toCustomerAuthor = (author: Record<string, unknown>) => ({
  id: author.id,
  name: author.name,
});

export const toCustomerMessage = (message: Record<string, unknown>) => ({
  author:
    message.author && typeof message.author === "object"
      ? toCustomerAuthor(message.author as Record<string, unknown>)
      : undefined,
  authorId: message.authorId,
  content: message.content,
  createdAt: message.createdAt,
  deletedAt: message.deletedAt ?? null,
  id: message.id,
  markedAsAnswer: message.markedAsAnswer,
  origin: message.origin,
  threadId: message.threadId,
});

export const toCustomerThread = (thread: Record<string, unknown>) => ({
  author:
    thread.author && typeof thread.author === "object"
      ? toCustomerAuthor(thread.author as Record<string, unknown>)
      : undefined,
  authorId: thread.authorId,
  createdAt: thread.createdAt,
  customerId: thread.customerId,
  deletedAt: thread.deletedAt,
  id: thread.id,
  messages: Array.isArray(thread.messages)
    ? thread.messages.map((message) =>
        toCustomerMessage(message as Record<string, unknown>)
      )
    : undefined,
  name: thread.name,
  organizationId: thread.organizationId,
  status: thread.status,
});
