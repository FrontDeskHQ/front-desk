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

  await db.insert(model, value);
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

  const author = await db.findOne(schema.author, thread.authorId);
  if (!author || !isWidgetAuthor(author) || !author.metaId) {
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
  if (!customerThread) {
    return false;
  }

  if (!(await syncCustomerAuthor(db, message.authorId))) {
    return false;
  }

  await upsert(db, schema.customerMessage, {
    authorId: message.authorId,
    content: message.content,
    createdAt: message.createdAt,
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
