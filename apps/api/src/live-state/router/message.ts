// TODO refactor with new live-state mental model
import { ulid } from "ulid";
import z from "zod";
import { authorize } from "../../lib/authorize";
import { searchMessages } from "../../lib/search/qdrant";
import { serializeMessageContent } from "../../lib/tiptap-content";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const STATUS_RESOLVED = 2;

const messageCreateInputSchema = z.object({
  threadId: z.string(),
  content: z.union([z.string(), z.any()]),
  organizationId: z.string(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  author: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(),
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  origin: z.string().nullable().optional(),
  externalMessageId: z.string().nullable().optional(),
  isBackfill: z.boolean().optional(),
});

const setExternalMessageIdInputSchema = z.object({
  messageId: z.string(),
  externalMessageId: z.string().min(1),
});

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
    create: mutation(messageCreateInputSchema).handler(async ({ req, db }) => {
      authorize(req, {
        organizationId: req.input.organizationId,
        allowPublicApiKey: true,
      });

      const hasIntegrationAuthor = !!req.input.author;
      if (
        hasIntegrationAuthor &&
        !req.context?.internalApiKey &&
        !req.context?.publicApiKey
      ) {
        throw new Error("UNAUTHORIZED");
      }

      const actualUserId: string | undefined =
        req.context?.portalSession?.session.userId ??
        req.context?.session?.userId ??
        req.input.userId;

      const actualUserName: string | undefined =
        req.context?.portalSession?.user.name ??
        req.context?.user?.name ??
        req.input.userName;

      if (!hasIntegrationAuthor && (!actualUserId || !actualUserName)) {
        throw new Error("MISSING_USER_ID_OR_NAME");
      }

      const thread = await db.thread.one(req.input.threadId).get();

      if (!thread || thread.organizationId !== req.input.organizationId) {
        throw new Error("THREAD_NOT_FOUND");
      }

      const content = serializeMessageContent(req.input.content);
      const messageId = req.input.id ?? ulid().toLowerCase();

      await db.transaction(async ({ trx }) => {
        let authorId: string | undefined;

        if (hasIntegrationAuthor && req.input.author) {
          const existingAuthor = await trx.author
            .first({
              metaId: req.input.author.id,
              organizationId: req.input.organizationId,
            })
            .get();

          authorId = existingAuthor?.id;

          if (!authorId) {
            authorId = ulid().toLowerCase();
            await trx.author.insert({
              id: authorId,
              name: req.input.author.name,
              organizationId: req.input.organizationId,
              metaId: req.input.author.id,
              userId: null,
            });
          }
        } else {
          if (!actualUserId || !actualUserName) {
            throw new Error("MISSING_USER_ID_OR_NAME");
          }

          const existingAuthor = await trx.author
            .first({
              userId: actualUserId,
              organizationId: req.input.organizationId,
            })
            .get();

          authorId = existingAuthor?.id;

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
        }

        await trx.message.insert({
          id: messageId,
          authorId: authorId,
          content: content,
          threadId: req.input.threadId,
          createdAt: req.input.createdAt ?? new Date(),
          origin: req.input.origin ?? null,
          externalMessageId: req.input.externalMessageId ?? null,
          isBackfill: req.input.isBackfill ?? false,
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
    markAsAnswer: mutation(
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
          authorize(req, {
            organizationId: thread.organizationId,
          });
        }
      }

      const existingAnswers = Object.values(
        await db.find(schema.message, {
          where: {
            threadId: message.threadId,
            markedAsAnswer: true,
          },
        }),
      );

      const hasOtherAnswer = existingAnswers.some(
        (existingMessage) => existingMessage.id !== message.id,
      );

      if (hasOtherAnswer) {
        throw new Error("ANSWER_ALREADY_SET");
      }

      if (!message.markedAsAnswer) {
        await db.transaction(async ({ trx }) => {
          await trx.update(schema.message, message.id, {
            markedAsAnswer: true,
          });
          await trx.update(schema.thread, thread.id, {
            status: STATUS_RESOLVED,
          });
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
    setExternalMessageId: mutation(setExternalMessageIdInputSchema).handler(
      async ({ req, db }) => {
        if (!req.context?.internalApiKey) {
          throw new Error("UNAUTHORIZED");
        }

        const message = await db.message.one(req.input.messageId).get();
        if (!message) {
          throw new Error("MESSAGE_NOT_FOUND");
        }

        await db.message.update(req.input.messageId, {
          externalMessageId: req.input.externalMessageId,
        });

        return {
          message: {
            ...message,
            externalMessageId: req.input.externalMessageId,
          },
        };
      },
    ),
  }));
