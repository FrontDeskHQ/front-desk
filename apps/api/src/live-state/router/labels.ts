import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const labelCreateInput = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  organizationId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  enabled: z.boolean(),
});

const labelUpdateInput = z.object({
  id: z.string(),
  name: z.string().optional(),
  color: z.string().optional(),
  enabled: z.boolean().optional(),
  updatedAt: z.coerce.date().optional(),
});

const threadLabelCreateInput = z.object({
  id: z.string(),
  threadId: z.string(),
  labelId: z.string(),
  enabled: z.boolean(),
});

const threadLabelUpdateInput = z.object({
  id: z.string(),
  enabled: z.boolean().optional(),
});

export default {
  label: publicRoute
    .collectionRoute(schema.label, {
      read: () => true,
      insert: () => false,
      update: {
        preMutation: () => false,
        postMutation: () => false,
      },
    })
    .withProcedures(({ mutation }) => ({
      create: mutation(labelCreateInput).handler(async ({ req, db }) => {
        if (!req.context.internalApiKey) {
          if (!req.context.session?.userId) {
            throw new Error("UNAUTHORIZED");
          }

          authorize(req.context, {
            organizationId: req.input.organizationId,
          });
        }

        await db.label.insert({
          id: req.input.id,
          name: req.input.name,
          color: req.input.color,
          organizationId: req.input.organizationId,
          createdAt: req.input.createdAt,
          updatedAt: req.input.updatedAt,
          enabled: req.input.enabled,
        });

        return { success: true as const };
      }),

      update: mutation(labelUpdateInput).handler(async ({ req, db }) => {
        const row = await db.label.one(req.input.id).get();
        if (!row) {
          throw new Error("LABEL_NOT_FOUND");
        }

        authorize(req.context, {
          organizationId: row.organizationId,
        });

        const hasField =
          req.input.name !== undefined ||
          req.input.color !== undefined ||
          req.input.enabled !== undefined ||
          req.input.updatedAt !== undefined;

        if (!hasField) {
          throw new Error("UPDATE_REQUIRES_FIELDS");
        }

        await db.label.update(req.input.id, {
          ...(req.input.name !== undefined ? { name: req.input.name } : {}),
          ...(req.input.color !== undefined ? { color: req.input.color } : {}),
          ...(req.input.enabled !== undefined
            ? { enabled: req.input.enabled }
            : {}),
          ...(req.input.updatedAt !== undefined
            ? { updatedAt: req.input.updatedAt }
            : {}),
        });

        return { success: true as const };
      }),
    })),

  threadLabel: publicRoute
    .collectionRoute(schema.threadLabel, {
      read: () => true,
      insert: () => false,
      update: {
        preMutation: () => false,
        postMutation: () => false,
      },
    })
    .withProcedures(({ mutation }) => ({
      create: mutation(threadLabelCreateInput).handler(async ({ req, db }) => {
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

        await db.threadLabel.insert({
          id: req.input.id,
          threadId: req.input.threadId,
          labelId: req.input.labelId,
          enabled: req.input.enabled,
        });

        return { success: true as const };
      }),

      update: mutation(threadLabelUpdateInput).handler(async ({ req, db }) => {
        const row = await db.threadLabel.one(req.input.id).get();
        if (!row) {
          throw new Error("THREAD_LABEL_NOT_FOUND");
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

        if (req.input.enabled === undefined) {
          throw new Error("UPDATE_REQUIRES_FIELDS");
        }

        await db.threadLabel.update(req.input.id, {
          enabled: req.input.enabled,
        });

        return { success: true as const };
      }),
    })),
};
