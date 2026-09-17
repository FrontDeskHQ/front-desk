// TODO refactor with new live-state mental model
import { callerOriginSchema } from "@workspace/schemas/message-roles";
import { ulid } from "ulid";
import z from "zod";

import {
  assertIntegrationAuthor,
  authorize,
  authorizeWidgetCustomer,
  getWorkspaceUserId,
  requireInternalApiKey,
  resolveHumanAuthor,
} from "../../lib/authorize";
import { toCustomerMessage } from "../../lib/customer-response";
import {
  ensureExternalAuthor,
  ensureWidgetAuthor,
  widgetAuthorMetaId,
} from "../../lib/external-author";
// Retired with `messages-v1` (FRO-224); see the commented search handler below.
// import { searchMessages } from "../../lib/search/qdrant";
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
  organizationId: z.string().optional(),
  origin: callerOriginSchema,
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
   * Internal lookup of a message by its external platform id for connector
   * deduplication.
   */
  byExternalId: query(
    z.object({
      externalMessageId: z.string(),
      threadId: z.string().optional(),
    })
  ).handler(async ({ req, db }) => {
    requireInternalApiKey(req.context);

    return Object.values(
      await db.find(schema.message, {
        where: {
          externalMessageId: req.input.externalMessageId,
          ...(req.input.threadId === undefined
            ? {}
            : { threadId: req.input.threadId }),
        },
      })
    )[0];
  }),

  /** Authenticated widget message stream for one of the caller's threads. */
  forThread: query(z.object({ threadId: z.string() })).handler(
    async ({ req, db }) => {
      const context = req.context ?? {};
      if (context.widgetIdentity) {
        const identity = authorizeWidgetCustomer(req, {
          organizationId: context.widgetIdentity.organizationId,
        });
        const thread = await db.customerThread
          .first({
            customerId: identity.userId,
            deletedAt: null,
            id: req.input.threadId,
            organizationId: identity.organizationId,
          })
          .get();
        if (!thread) {
          throw new Error("UNAUTHORIZED");
        }

        return db.customerMessage
          .where({ deletedAt: null, threadId: thread.id })
          .include({ author: true })
          .orderBy("createdAt", "asc");
      }

      const credentialOrganizationId =
        context.publicApiKey?.ownerId ?? context.privateApiKey?.ownerId;
      const organizationIds = context.internalApiKey
        ? null
        : credentialOrganizationId
          ? [credentialOrganizationId]
          : [
              ...new Set(
                context.orgUsers?.map(
                  (orgUser: { organizationId: string }) =>
                    orgUser.organizationId
                ) ?? []
              ),
            ];

      if (organizationIds !== null && organizationIds.length === 0) {
        throw new Error("UNAUTHORIZED");
      }

      const threads = await db.thread
        .where({
          id: req.input.threadId,
          ...(organizationIds === null
            ? {}
            : { organizationId: { $in: organizationIds } }),
        })
        .include({ author: true })
        .get();
      const thread = threads[0];

      if (!thread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      if (req.context?.publicApiKey) {
        throw new Error("IDENTITY_TOKEN_REQUIRED");
      }
      authorize(req, { organizationId: thread.organizationId });

      return db.message
        .where({ threadId: thread.id })
        .include({ author: true })
        .orderBy("createdAt", "asc");
    }
  ),

  create: mutation(messageCreateInputSchema).handler(async ({ req, db }) => {
    const widgetIdentity = req.context?.widgetIdentity;
    const organizationId =
      widgetIdentity?.organizationId ?? req.input.organizationId;

    if (!organizationId) {
      throw new Error("MISSING_ORGANIZATION_ID");
    }
    if (
      widgetIdentity &&
      req.input.organizationId !== undefined &&
      req.input.organizationId !== widgetIdentity.organizationId
    ) {
      throw new Error("UNAUTHORIZED");
    }
    if (
      widgetIdentity &&
      req.input.userId !== undefined &&
      req.input.userId !== widgetIdentity.userId
    ) {
      throw new Error("UNAUTHORIZED");
    }

    if (widgetIdentity) {
      authorizeWidgetCustomer(req, {
        organizationId,
        userId: req.input.userId,
      });
    } else {
      authorize(req, {
        allowPublicApiKey: true,
        organizationId,
      });
    }

    const hasIntegrationAuthor = !widgetIdentity && !!req.input.author;
    if (hasIntegrationAuthor) {
      assertIntegrationAuthor(req);
      if (req.context?.publicApiKey) {
        throw new Error("IDENTITY_TOKEN_REQUIRED");
      }
    }

    const humanAuthor =
      hasIntegrationAuthor || widgetIdentity ? null : resolveHumanAuthor(req);

    const thread = await db.thread.one(req.input.threadId).get();

    if (!thread || thread.organizationId !== organizationId) {
      if (widgetIdentity) {
        throw new Error("UNAUTHORIZED");
      }
      throw new Error("THREAD_NOT_FOUND");
    }

    if (widgetIdentity) {
      const threadAuthor = await db.author.one(thread.authorId).get();
      if (
        threadAuthor?.organizationId !== organizationId ||
        threadAuthor?.metaId !== widgetAuthorMetaId(widgetIdentity.userId)
      ) {
        throw new Error("UNAUTHORIZED");
      }
    }

    const content = serializeMessageContent(req.input.content);
    const messageId = req.input.id ?? ulid().toLowerCase();

    await db.transaction(async ({ trx }) => {
      let authorId: string | undefined;

      if (hasIntegrationAuthor && req.input.author) {
        authorId = await ensureExternalAuthor(trx, {
          metaId: req.input.author.id,
          name: req.input.author.name,
          organizationId,
        });
      } else if (widgetIdentity) {
        authorId = await ensureWidgetAuthor(trx, {
          name: widgetIdentity.name,
          organizationId,
          userId: widgetIdentity.userId,
        });
      } else {
        if (!humanAuthor) {
          throw new Error("AUTHOR_REQUIRED");
        }
        const { userId: actualUserId, userName: actualUserName } = humanAuthor;

        const existingAuthor = await trx.author
          .first({ organizationId, userId: actualUserId })
          .get();

        authorId = existingAuthor?.id;

        if (!authorId) {
          authorId = ulid().toLowerCase();
          await trx.author.insert({
            id: authorId,
            metaId: null,
            name: actualUserName,
            organizationId,
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

    return widgetIdentity && message
      ? (toCustomerMessage(
          message as unknown as Record<string, unknown>
        ) as unknown as typeof message)
      : message;
  }),
  markAsAnswer: mutation(
    z.object({
      messageId: z.string(),
    })
  ).handler(async ({ req, db }) => {
    const callerUserId = getWorkspaceUserId(req.context ?? {});

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

    if (!req.context?.internalApiKey) {
      authorize(req, {
        organizationId: thread.organizationId,
      });
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
  /**
   * Stubbed with the `messages-v1` index behind it (FRO-224). Kept as a
   * procedure so the search page keeps rendering its empty state instead of
   * erroring; the page is gated behind the `in-app-search` flag, which is off
   * everywhere.
   */
  search: mutation(
    z.object({
      organizationId: z.string(),
      query: z.string(),
    })
  ).handler(async () => ({ hits: [] as { document: { id: string } }[] })),

  // search: mutation(
  //   z.object({
  //     organizationId: z.string(),
  //     query: z.string(),
  //   })
  // ).handler(async ({ req }) => {
  //   const results = await searchMessages({
  //     organizationId: req.input.organizationId,
  //     query: req.input.query,
  //   });
  //
  //   return {
  //     hits: results.map((r) => ({
  //       document: { id: r.messageId },
  //     })),
  //   };
  // }),
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
