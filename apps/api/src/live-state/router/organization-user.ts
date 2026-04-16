import { ulid } from "ulid";
import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { privateRoute } from "../factories";
import { schema } from "../schema";

export const organizationUserRoute = privateRoute
  .collectionRoute(schema.organizationUser, {
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
        id: z.string().optional(),
        organizationId: z.string(),
        userId: z.string(),
        enabled: z.boolean().optional(),
        role: z.string().optional(),
      }),
    ).handler(async ({ req, db }) => {
      if (req.context.internalApiKey) {
        await db.organizationUser.insert({
          id: req.input.id ?? ulid().toLowerCase(),
          organizationId: req.input.organizationId,
          userId: req.input.userId,
          enabled: req.input.enabled ?? true,
          role: req.input.role ?? "user",
        });

        return { success: true as const };
      }

      if (!req.context.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      authorize(req.context, {
        organizationId: req.input.organizationId,
        role: "owner",
      });

      await db.organizationUser.insert({
        id: req.input.id ?? ulid().toLowerCase(),
        organizationId: req.input.organizationId,
        userId: req.input.userId,
        enabled: req.input.enabled ?? true,
        role: req.input.role ?? "user",
      });

      return { success: true as const };
    }),
    update: mutation(
      z.object({
        id: z.string(),
        role: z.string().optional(),
        enabled: z.boolean().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const row = await db.organizationUser.one(req.input.id).get();
      if (!row) {
        throw new Error("ORGANIZATION_USER_NOT_FOUND");
      }

      if (req.input.role === undefined && req.input.enabled === undefined) {
        throw new Error("UPDATE_REQUIRES_FIELDS");
      }

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }
        authorize(req.context, {
          organizationId: row.organizationId,
          role: "owner",
        });
      }

      await db.organizationUser.update(req.input.id, {
        ...(req.input.role !== undefined ? { role: req.input.role } : {}),
        ...(req.input.enabled !== undefined ? { enabled: req.input.enabled } : {}),
      });

      return { success: true as const };
    }),
  }));
