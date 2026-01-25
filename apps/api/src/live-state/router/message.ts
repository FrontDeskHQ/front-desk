import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { ulid } from "ulid";
import z from "zod";
import { enqueueIngestThreadJob } from "../../lib/queue";
import { createDocument, searchDocuments } from "../../lib/search/typesense";
import { publicRoute } from "../factories";
import { schema } from "../schema";
import { storage } from "../storage";

const STATUS_RESOLVED = 2;

export default publicRoute
  .collectionRoute(schema.message, {
    read: () => true,
    insert: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;

      if (ctx?.publicApiKey) {
        return {
          thread: {
            organization: {
              id: ctx.publicApiKey.ownerId,
            },
          },
        };
      }

      if (!ctx?.session && !ctx?.portalSession?.session) return false;

      return {
        thread: {
          organization: {
            organizationUsers: {
              userId: ctx.session?.userId ?? ctx.portalSession?.session.userId,
              enabled: true,
            },
          },
        },
      };
    },
    update: {
      preMutation: ({ ctx }) => !!ctx?.internalApiKey,
      postMutation: ({ ctx }) => !!ctx?.internalApiKey,
    },
  })
  .withMutations(({ mutation }) => ({
    create: mutation(
      z.object({
        threadId: z.string(),
        content: z.union([z.string(), z.any()]), // Accept string or TipTap JSONContent
        userId: z.string().optional(),
        userName: z.string().optional(),
        organizationId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      // Support portal session or internal API key
      if (
        !req.context?.portalSession?.session &&
        !req.context?.internalApiKey
      ) {
        throw new Error("UNAUTHORIZED");
      }

      // For portal sessions, verify the user matches
      if (req.context?.portalSession?.session) {
        const sessionUserId = req.context.portalSession.session.userId;
        if (req.input.userId && req.input.userId !== sessionUserId) {
          throw new Error("UNAUTHORIZED");
        }
      }

      // Verify thread exists and belongs to the expected organization
      const thread = await storage.findOne(schema.thread, req.input.threadId);
      if (!thread || thread.organizationId !== req.input.organizationId) {
        throw new Error("THREAD_NOT_FOUND");
      }

      // Convert string content to TipTap format if needed
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
        // Get or create author
        const userId =
          req.input.userId ?? req.context?.portalSession?.session.userId;
        const userName =
          req.input.userName ??
          req.context?.portalSession?.session.userName ??
          "Unknown User";

        const existingAuthor = Object.values(
          await trx.find(schema.author, {
            where: {
              userId: userId,
              organizationId: req.input.organizationId,
            },
          }),
        );

        let authorId = existingAuthor[0]?.id;

        if (!authorId) {
          authorId = ulid().toLowerCase();
          await trx.insert(schema.author, {
            id: authorId,
            userId: userId,
            metaId: null,
            name: userName,
            organizationId: req.input.organizationId,
          });
        }

        // Create message
        await trx.insert(schema.message, {
          id: messageId,
          authorId: authorId,
          content: content,
          threadId: req.input.threadId,
          createdAt: new Date(),
          origin: null,
          externalMessageId: null,
        });
      });

      const message = Object.values(
        await db.find(schema.message, {
          where: { id: messageId },
          include: {
            author: true,
          },
        }),
      )[0];

      return message;
    }),
    markAsAnswer: mutation(
      z.object({
        messageId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const isInternalApiKey = !!req.context?.internalApiKey;
      const callerUserId =
        req.context?.session?.userId ??
        req.context?.portalSession?.session.userId;

      if (!isInternalApiKey && !callerUserId) {
        throw new Error("UNAUTHORIZED");
      }

      const message = (
        await db.find(schema.message, {
          where: { id: req.input.messageId },
        })
      )[0];

      if (!message) {
        throw new Error("MESSAGE_NOT_FOUND");
      }

      const thread = (
        await db.find(schema.thread, {
          where: { id: message.threadId },
        })
      )[0];

      if (!thread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      if (!isInternalApiKey && callerUserId) {
        const threadAuthor = (
          await db.find(schema.author, {
            where: { id: thread.authorId },
          })
        )[0];

        const isThreadAuthor = threadAuthor?.userId === callerUserId;

        const organizationUsers = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId: thread.organizationId,
              userId: callerUserId,
              enabled: true,
            },
          }),
        );

        const isOrganizationMember = organizationUsers.length > 0;

        if (!isThreadAuthor && !isOrganizationMember) {
          throw new Error("UNAUTHORIZED");
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

      const updatedMessage = Object.values(
        await db.find(schema.message, {
          where: { id: message.id },
          include: {
            author: true,
          },
        }),
      )[0];

      return updatedMessage ?? { ...message, markedAsAnswer: true };
    }),
    search: mutation(
      z.object({
        query: z.string(),
        organizationId: z.string(),
      }),
    ).handler(async ({ req }) => {
      const messages = await searchDocuments("messages", {
        q: req.input.query,
        filter_by: `organizationId:=${req.input.organizationId}`,
        query_by: "content",
      });

      return messages;
    }),
  }))
  .withHooks({
    afterInsert: ({ value }) => {
      (async () => {
        try {
          const plainTextContent = jsonContentToPlainText(
            safeParseJSON(value.content),
          );

          const thread = Object.values(
            await storage.find(schema.thread, {
              where: { id: value.threadId },
            }),
          )[0];

          if (!thread) {
            console.error(
              `Thread not found for message ${value.id}, threadId: ${value.threadId}`,
            );
            return;
          }

          const organizationId = thread.organizationId;

          const allMessages = Object.values(
            await storage.find(schema.message, {
              where: { threadId: value.threadId },
            }),
          );

          const sortedMessages = [...allMessages].sort((a, b) =>
            a.id.localeCompare(b.id),
          );
          const messageIndex =
            sortedMessages.findIndex((msg) => msg.id === value.id) + 1;

          const created = await createDocument("messages", {
            id: value.id,
            content: plainTextContent,
            organizationId: organizationId,
            threadId: value.threadId,
            messageIndex: messageIndex,
          });

          if (!created) {
            console.error(`error creating message ${value.id} in typesense`);
          }

          const isFirstMessageInThread = sortedMessages[0]?.id === value.id;
          if (!isFirstMessageInThread) {
            return;
          }

          const jobId = await enqueueIngestThreadJob({
            threadIds: [value.threadId],
          });

          if (!jobId) {
            console.warn(
              `Redis queue not configured; skipping ingest-thread enqueue for thread ${value.threadId}`,
            );
          }
        } catch (error) {
          console.error(
            `Unhandled error in afterInsert hook for message ${value.id}`,
            error,
          );
        }
      })();
    },
  });
