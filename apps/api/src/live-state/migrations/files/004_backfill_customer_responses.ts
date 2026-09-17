import type { Migration } from "../types";

const migration: Migration = {
  name: "004_backfill_customer_responses",
  up: async ({ db }) => {
    const authors = await db.author.where({}).get();
    const authorsById = new Map(authors.map((author) => [author.id, author]));
    const widgetAuthorIds = new Set(
      authors
        .filter((author) => author.metaId?.startsWith("widget:"))
        .map((author) => author.id)
    );

    for (const author of authors) {
      if (!widgetAuthorIds.has(author.id)) {
        continue;
      }
      await db.customerAuthor.insert({ id: author.id, name: author.name });
    }

    const threads = await db.thread.where({}).get();
    const customerThreadIds = new Set<string>();
    for (const thread of threads) {
      if (!widgetAuthorIds.has(thread.authorId)) {
        continue;
      }
      const author = authorsById.get(thread.authorId);
      if (!author?.metaId) {
        continue;
      }

      customerThreadIds.add(thread.id);
      await db.customerThread.insert({
        authorId: thread.authorId,
        createdAt: thread.createdAt,
        customerId: author.metaId.slice("widget:".length),
        deletedAt: thread.deletedAt,
        id: thread.id,
        name: thread.name,
        organizationId: thread.organizationId,
        status: thread.status,
      });
    }

    const messages = await db.message.where({}).get();
    for (const message of messages) {
      if (!customerThreadIds.has(message.threadId)) {
        continue;
      }

      const author = authorsById.get(message.authorId);
      if (author && !widgetAuthorIds.has(author.id)) {
        await db.customerAuthor.insert({ id: author.id, name: author.name });
        widgetAuthorIds.add(author.id);
      }

      await db.customerMessage.insert({
        authorId: message.authorId,
        content: message.content,
        createdAt: message.createdAt,
        deletedAt: null,
        id: message.id,
        markedAsAnswer: message.markedAsAnswer,
        origin: message.origin,
        threadId: message.threadId,
      });
    }
  },
};

export default migration;
