// TODO refactor with new live-state mental model
import { ulid } from "ulid";
import z from "zod";

import {
  assertIntegrationAuthor,
  authorize,
  getCallerUserId,
  requireInternalApiKey,
  resolveHumanAuthor,
} from "../../lib/authorize";
import { searchMessages } from "../../lib/search/qdrant";
import { serializeMessageContent } from "../../lib/tiptap-content";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const STATUS_RESOLVED = 2;

const messageCreateInputSchema = z.object({
  author: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(),
  content: z.union([z.string(), z.any()]),
  createdAt: z.coerce.date().optional(),
  externalMessageId: z.string().nullable().optional(),
  id: z.string().optional(),
  isBackfill: z.boolean().optional(),
  organizationId: z.string(),
  origin: z.string().nullable().optional(),
  threadId: z.string(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

const setExternalMessageIdInputSchema = z.object({
  externalMessageId: z.string().min(1),
  messageId: z.string(),
});

export default publicRoute.withProcedures(({ mutation, query }) => ({
  /**
   * Existence/lookup of a message by its external (platform) id — dedupe
   * checks in the integration bots. Public: mirrors the old open read.
   */
  byExternalId: query(
    z.object({
      externalMessageId: z.string(),
      threadId: z.string().optional(),
    })
  ).handler(
    async ({ req, db }) =>
      Object.values(
        await db.find(schema.message, {
          where: {
            externalMessageId: req.input.externalMessageId,
            ...(req.input.threadId === undefined
              ? {}
              : { threadId: req.input.threadId }),
          },
        })
      )[0]
  ),

  create: mutation(messageCreateInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      allowPortalUser: true,
      allowPublicApiKey: true,
      organizationId: req.input.organizationId,
    });

    const hasIntegrationAuthor = !!req.input.author;
    if (hasIntegrationAuthor) {
      assertIntegrationAuthor(req);
    }

    const humanAuthor = hasIntegrationAuthor ? null : resolveHumanAuthor(req);

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
            metaId: req.input.author.id,
            name: req.input.author.name,
            organizationId: req.input.organizationId,
            userId: null,
          });
        }
      } else {
        if (!humanAuthor) {
          throw new Error("AUTHOR_REQUIRED");
        }
        const { userId: actualUserId, userName: actualUserName } = humanAuthor;

        const existingAuthor = await trx.author
          .first({
            organizationId: req.input.organizationId,
            userId: actualUserId,
          })
          .get();

        authorId = existingAuthor?.id;

        if (!authorId) {
          authorId = ulid().toLowerCase();
          await trx.author.insert({
            id: authorId,
            metaId: null,
            name: actualUserName,
            organizationId: req.input.organizationId,
            userId: actualUserId,
          });
        }
      }

      await trx.message.insert({
        authorId,
        content,
        createdAt: req.input.createdAt ?? new Date(),
        externalMessageId: req.input.externalMessageId ?? null,
        id: messageId,
        isBackfill: req.input.isBackfill ?? false,
        origin: req.input.origin ?? null,
        threadId: req.input.threadId,
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
    })
  ).handler(async ({ req, db }) => {
    const callerUserId = getCallerUserId(req);

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
          markedAsAnswer: true,
          threadId: message.threadId,
        },
      })
    );

    const hasOtherAnswer = existingAnswers.some(
      (existingMessage) => existingMessage.id !== message.id
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
      organizationId: z.string(),
      query: z.string(),
    })
  ).handler(async ({ req }) => {
    const results = await searchMessages({
      organizationId: req.input.organizationId,
      query: req.input.query,
    });

    return {
      hits: results.map((r) => ({
        document: { id: r.messageId },
      })),
    };
  }),
  setExternalMessageId: mutation(setExternalMessageIdInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);

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
    }
  ),
}));
