import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { ulid } from "ulid";
import z from "zod";
import { typesenseClient } from "../../lib/search/typesense";
import { publicRoute } from "../factories";
import { schema } from "../schema";

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
      })
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
      const thread = await db.findOne(schema.thread, req.input.threadId);
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
          })
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
        })
      )[0];

      return message;
    }),
    search: mutation(
      z.object({
        query: z.string(),
        organizationId: z.string(),
      })
    ).handler(async ({ req }) => {
      console.log(
        "all messages",
        await typesenseClient?.collections("messages").documents().export()
      );

      const messages = await typesenseClient
        ?.collections("messages")
        .documents()
        .search({
          q: req.input.query,
          filter_by: `organizationId:=${req.input.organizationId}`,
          query_by: "content",
        });

      return messages;
    }),
  }))
  .withHooks({
    afterInsert: ({ value, db }) => {
      console.log("afterInsert", value);

      (async () => {
        const thread = (
          await db.find(schema.thread, {
            where: { id: value.threadId },
          })
        )[0];

        const organizationId = thread.organizationId;

        await typesenseClient
          ?.collections("messages")
          .documents()
          .create({
            id: value.id,
            content: jsonContentToPlainText(safeParseJSON(value.content)),
            organizationId: organizationId,
          })
          .then(() => console.log(`message ${value.id} created in typesense`))
          .catch((error) =>
            console.error(
              `error creating message ${value.id} in typesense`,
              error
            )
          );
      })();
    },
  });
