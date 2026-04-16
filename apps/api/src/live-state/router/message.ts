import { ulid } from "ulid";
import z from "zod";
import { authorize } from "../../lib/authorize";
import { deactivateDigestSignals } from "../../lib/digest-signals";
import { enqueueIngestThreadJob } from "../../lib/queue";
import { searchMessages } from "../../lib/search/qdrant";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const STATUS_RESOLVED = 2;

const messageSeedInput = z.object({
  id: z.string(),
  threadId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.coerce.date(),
  origin: z.string().nullable().optional(),
  externalMessageId: z.string().nullable().optional(),
  isBackfill: z.boolean().optional(),
});

const messageSyncCreateInput = z.object({
  action: z.literal("create"),
  id: z.string(),
  threadId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.coerce.date(),
  origin: z.string().nullable().optional(),
  isBackfill: z.boolean().optional(),
  externalMessageId: z.string().nullable().optional(),
});

const messageSyncUpdateInput = z.object({
  action: z.literal("update"),
  id: z.string(),
  externalMessageId: z.string().nullable().optional(),
  content: z.string().optional(),
});

const messageSyncInput = z.discriminatedUnion("action", [
  messageSyncCreateInput,
  messageSyncUpdateInput,
]);

export default publicRoute
  .collectionRoute(schema.message, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    create: mutation(
      z.object({
        threadId: z.string(),
        content: z.union([z.string(), z.any()]), // Accept string or TipTap JSONContent
        userId: z.string().optional(),
        userName: z.string().optional(),
        organizationId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      authorize(req.context, {
        organizationId: req.input.organizationId,
        allowPublicApiKey: true,
      });

      const actualUserId: string | undefined =
        req.context?.portalSession?.session.userId ??
        req.context?.session?.userId ??
        req.input.userId;

      const actualUserName: string | undefined =
        req.context?.portalSession?.user.name ??
        req.context?.user?.name ??
        req.input.userName;

      if (!actualUserId || !actualUserName) {
        throw new Error("MISSING_USER_ID_OR_NAME");
      }

      const thread = await db.thread.one(req.input.threadId).get();

      if (!thread || thread.organizationId !== req.input.organizationId) {
        throw new Error("THREAD_NOT_FOUND");
      }

      const content =
        typeof req.input.content === "string"
          ? JSON.stringify([
              {
                type: "paragraph",
                content: [{ type: "text", text: req.input.content }],
              },
            ])
          : JSON.stringify(req.input.content);

      const messageId = ulid().toLowerCase();

      await db.transaction(async ({ trx }) => {
        const existingAuthor = await trx.author
          .first({
            userId: actualUserId,
            organizationId: req.input.organizationId,
          })
          .get();

        let authorId = existingAuthor?.id;

        if (!authorId) {
          authorId = ulid().toLowerCase();

          await trx.author.insert({
            id: authorId,
            userId: actualUserId,
            metaId: null,
            name: actualUserName,
            organizationId: req.input.organizationId,
          });
        }

        await trx.message.insert({
          id: messageId,
          authorId: authorId,
          content: content,
          threadId: req.input.threadId,
          createdAt: new Date(),
          origin: null,
          externalMessageId: null,
        });
      });

      const message = await db.message
        .one(messageId)
        .include({
          author: true,
        })
        .get();

      return message;
    }),
    seed: mutation(messageSeedInput).handler(async ({ req, db }) => {
      if (!req.context?.internalApiKey && !req.context?.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const thread = await db.thread.one(req.input.threadId).get();
      if (!thread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      if (!req.context.internalApiKey) {
        authorize(req.context, {
          organizationId: thread.organizationId,
        });
      }

      await db.message.insert({
        id: req.input.id,
        threadId: req.input.threadId,
        authorId: req.input.authorId,
        content: req.input.content,
        createdAt: req.input.createdAt,
        origin: req.input.origin ?? null,
        externalMessageId: req.input.externalMessageId ?? null,
        isBackfill: req.input.isBackfill ?? false,
      });

      return await db.message
        .one(req.input.id)
        .include({ author: true })
        .get();
    }),
    sync: mutation(messageSyncInput).handler(async ({ req, db }) => {
      if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      if (req.input.action === "create") {
        const thread = await db.thread.one(req.input.threadId).get();
        if (!thread) {
          throw new Error("THREAD_NOT_FOUND");
        }

        await db.message.insert({
          id: req.input.id,
          threadId: req.input.threadId,
          authorId: req.input.authorId,
          content: req.input.content,
          createdAt: req.input.createdAt,
          origin: req.input.origin ?? null,
          externalMessageId: req.input.externalMessageId ?? null,
          isBackfill: req.input.isBackfill ?? false,
        });

        return await db.message
          .one(req.input.id)
          .include({ author: true })
          .get();
      }

      const message = await db.message.one(req.input.id).get();
      if (!message) {
        throw new Error("MESSAGE_NOT_FOUND");
      }

      const messageThread = await db.thread.one(message.threadId).get();
      if (!messageThread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      await db.message.update(message.id, {
        ...(req.input.externalMessageId !== undefined
          ? { externalMessageId: req.input.externalMessageId }
          : {}),
        ...(req.input.content !== undefined ? { content: req.input.content } : {}),
      });

      return await db.message
        .one(message.id)
        .include({ author: true })
        .get();
    }),
    update: mutation(
      z.object({
        id: z.string(),
        content: z.string().optional(),
        markedAsAnswer: z.boolean().optional(),
        externalMessageId: z.string().nullable().optional(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      const message = await db.message.one(req.input.id).get();
      if (!message) {
        throw new Error("MESSAGE_NOT_FOUND");
      }

      await db.message.update(req.input.id, {
        ...(req.input.content !== undefined ? { content: req.input.content } : {}),
        ...(req.input.markedAsAnswer !== undefined
          ? { markedAsAnswer: req.input.markedAsAnswer }
          : {}),
        ...(req.input.externalMessageId !== undefined
          ? { externalMessageId: req.input.externalMessageId }
          : {}),
      });

      return await db.message
        .one(req.input.id)
        .include({ author: true })
        .get();
    }),
    answer: mutation(
      z.object({
        messageId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const callerUserId =
        req.context?.portalSession?.session.userId ??
        req.context?.session?.userId;

      if (!req.context?.internalApiKey && !callerUserId) {
        throw new Error("UNAUTHORIZED");
      }

      const message = await db.message.one(req.input.messageId).get();
      if (!message) {
        throw new Error("MESSAGE_NOT_FOUND");
      }

      const thread = await db.thread.one(message.threadId).get();
      if (!thread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      if (!req.context?.internalApiKey && callerUserId) {
        const threadAuthor = await db.author.one(thread.authorId).get();
        const isThreadAuthor = threadAuthor?.userId === callerUserId;

        if (!isThreadAuthor) {
          authorize(req.context, {
            organizationId: thread.organizationId,
          });
        }
      }

      const existingAnswers = await db.message
        .where({
          threadId: message.threadId,
          markedAsAnswer: true,
        })
        .get();

      const hasOtherAnswer = existingAnswers.some(
        (existingMessage) => existingMessage.id !== message.id,
      );

      if (hasOtherAnswer) {
        throw new Error("ANSWER_ALREADY_SET");
      }

      if (!message.markedAsAnswer) {
        await db.transaction(async ({ trx }) => {
          await trx.message.update(message.id, {
            markedAsAnswer: true,
          });
          await trx.thread.update(thread.id, {
            status: STATUS_RESOLVED,
          });
        });

        deactivateDigestSignals(db, thread.organizationId, thread.id, [
          "digest:pending_reply",
          "digest:loop_to_close",
        ]).catch((error) => {
          console.error(
            `Failed to deactivate digest signals for thread ${thread.id}:`,
            error,
          );
        });
      }

      const updatedMessage = await db.message
        .one(message.id)
        .include({
          author: true,
        })
        .get();

      return updatedMessage ?? { ...message, markedAsAnswer: true };
    }),
    search: mutation(
      z.object({
        query: z.string(),
        organizationId: z.string(),
      }),
    ).handler(async ({ req }) => {
      const results = await searchMessages({
        query: req.input.query,
        organizationId: req.input.organizationId,
      });

      return {
        hits: results.map((r) => ({
          document: { id: r.messageId },
        })),
      };
    }),
  }))
  .withHooks({
    afterInsert: ({ value, db }) => {
      (async () => {
        try {
          const queuePriority = value.isBackfill ? "low" : "high";
          const jobId = await enqueueIngestThreadJob({
            threadIds: [value.threadId],
            priority: queuePriority,
          });

          if (!jobId) {
            console.warn(
              `Redis queue not configured; skipping ingest-thread enqueue for thread ${value.threadId}`,
            );
          }
        } catch (error) {
          console.error(
            `Unhandled error in afterInsert ingest enqueue for message ${value.id}`,
            error,
          );
        }

        try {
          if (!value.isBackfill) {
            const author = await db.author.one(value.authorId).get();
            if (author?.userId) {
              const thread = await db.thread.one(value.threadId).get();
              if (thread?.assignedUserId === author.userId) {
                await deactivateDigestSignals(
                  db,
                  thread.organizationId,
                  value.threadId,
                  ["digest:pending_reply", "digest:loop_to_close"],
                );
              }
            }
          }
        } catch (error) {
          console.error(
            `Failed to deactivate digest signals for message ${value.id}`,
            error,
          );
        }
      })();
    },
  });
