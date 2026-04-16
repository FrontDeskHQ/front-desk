import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const timelineCreateInput = z.object({
  id: z.string(),
  threadId: z.string(),
  userId: z.string().nullable(),
  type: z.string(),
  createdAt: z.coerce.date(),
  metadataStr: z.string().nullable(),
  replicatedStr: z.string().nullable(),
});

const timelineUpdateInput = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  type: z.string().optional(),
  metadataStr: z.string().nullable().optional(),
  replicatedStr: z.string().nullable().optional(),
});

export default publicRoute
  .collectionRoute(schema.update, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    create: mutation(timelineCreateInput).handler(async ({ req, db }) => {
      const thread = await db.thread.one(req.input.threadId).get();
      if (!thread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }

        authorize(req.context, {
          organizationId: thread.organizationId,
        });
      }

      await db.insert(schema.update, {
        id: req.input.id,
        threadId: req.input.threadId,
        userId: req.input.userId,
        type: req.input.type,
        createdAt: req.input.createdAt,
        metadataStr: req.input.metadataStr,
        replicatedStr: req.input.replicatedStr,
      });

      return { success: true as const };
    }),

    update: mutation(timelineUpdateInput).handler(async ({ req, db }) => {
      const row = await db.findOne(schema.update, req.input.id);
      if (!row) {
        throw new Error("UPDATE_ROW_NOT_FOUND");
      }

      const thread = await db.thread.one(row.threadId).get();
      if (!thread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }

        authorize(req.context, {
          organizationId: thread.organizationId,
        });
      }

      const hasField =
        req.input.userId !== undefined ||
        req.input.type !== undefined ||
        req.input.metadataStr !== undefined ||
        req.input.replicatedStr !== undefined;

      if (!hasField) {
        throw new Error("UPDATE_REQUIRES_FIELDS");
      }

      await db.update(schema.update, req.input.id, {
        ...(req.input.userId !== undefined ? { userId: req.input.userId } : {}),
        ...(req.input.type !== undefined ? { type: req.input.type } : {}),
        ...(req.input.metadataStr !== undefined
          ? { metadataStr: req.input.metadataStr }
          : {}),
        ...(req.input.replicatedStr !== undefined
          ? { replicatedStr: req.input.replicatedStr }
          : {}),
      });

      return { success: true as const };
    }),
  }));
