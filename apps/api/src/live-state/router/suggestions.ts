import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { privateRoute } from "../factories";
import { schema } from "../schema";

const suggestionCreateInput = z.object({
  id: z.string(),
  type: z.string(),
  entityId: z.string(),
  relatedEntityId: z.string().nullable(),
  active: z.boolean(),
  accepted: z.boolean(),
  organizationId: z.string(),
  resultsStr: z.string().nullable(),
  metadataStr: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const suggestionUpdateInput = z.object({
  id: z.string(),
  type: z.string().optional(),
  entityId: z.string().optional(),
  relatedEntityId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  accepted: z.boolean().optional(),
  resultsStr: z.string().nullable().optional(),
  metadataStr: z.string().nullable().optional(),
  updatedAt: z.coerce.date().optional(),
});

export default privateRoute
  .collectionRoute(schema.suggestion, {
    read: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        organization: {
          organizationUsers: {
            userId: ctx.session.userId,
            enabled: true,
          },
        },
      };
    },
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    create: mutation(suggestionCreateInput).handler(async ({ req, db }) => {
      if (req.context.internalApiKey) {
        await db.suggestion.insert({
          id: req.input.id,
          type: req.input.type,
          entityId: req.input.entityId,
          relatedEntityId: req.input.relatedEntityId,
          active: req.input.active,
          accepted: req.input.accepted,
          organizationId: req.input.organizationId,
          resultsStr: req.input.resultsStr,
          metadataStr: req.input.metadataStr,
          createdAt: req.input.createdAt,
          updatedAt: req.input.updatedAt,
        });

        return { success: true as const };
      }

      if (!req.context.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const isDev = (process.env.NODE_ENV ?? "development") === "development";
      if (!isDev) {
        throw new Error("UNAUTHORIZED");
      }

      authorize(req.context, {
        organizationId: req.input.organizationId,
      });

      await db.suggestion.insert({
        id: req.input.id,
        type: req.input.type,
        entityId: req.input.entityId,
        relatedEntityId: req.input.relatedEntityId,
        active: req.input.active,
        accepted: req.input.accepted,
        organizationId: req.input.organizationId,
        resultsStr: req.input.resultsStr,
        metadataStr: req.input.metadataStr,
        createdAt: req.input.createdAt,
        updatedAt: req.input.updatedAt,
      });

      return { success: true as const };
    }),

    update: mutation(suggestionUpdateInput).handler(async ({ req, db }) => {
      const row = await db.suggestion.one(req.input.id).get();
      if (!row) {
        throw new Error("SUGGESTION_NOT_FOUND");
      }

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }

        authorize(req.context, {
          organizationId: row.organizationId,
        });
      }

      const hasField =
        req.input.type !== undefined ||
        req.input.entityId !== undefined ||
        req.input.relatedEntityId !== undefined ||
        req.input.active !== undefined ||
        req.input.accepted !== undefined ||
        req.input.resultsStr !== undefined ||
        req.input.metadataStr !== undefined ||
        req.input.updatedAt !== undefined;

      if (!hasField) {
        throw new Error("UPDATE_REQUIRES_FIELDS");
      }

      await db.suggestion.update(req.input.id, {
        ...(req.input.type !== undefined ? { type: req.input.type } : {}),
        ...(req.input.entityId !== undefined ? { entityId: req.input.entityId } : {}),
        ...(req.input.relatedEntityId !== undefined
          ? { relatedEntityId: req.input.relatedEntityId }
          : {}),
        ...(req.input.active !== undefined ? { active: req.input.active } : {}),
        ...(req.input.accepted !== undefined ? { accepted: req.input.accepted } : {}),
        ...(req.input.resultsStr !== undefined ? { resultsStr: req.input.resultsStr } : {}),
        ...(req.input.metadataStr !== undefined
          ? { metadataStr: req.input.metadataStr }
          : {}),
        ...(req.input.updatedAt !== undefined ? { updatedAt: req.input.updatedAt } : {}),
      });

      return { success: true as const };
    }),
  }));
