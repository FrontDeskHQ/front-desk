import { ulid } from "ulid";
import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const isPostgresUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, cause } = error as { code?: string; cause?: unknown };
  if (code === "23505") {
    return true;
  }
  if (cause !== undefined && cause !== null) {
    return isPostgresUniqueViolation(cause);
  }
  return false;
};

export const authorRoute = publicRoute
  .collectionRoute(schema.author, {
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
        organizationId: z.string(),
        name: z.string(),
        id: z.string().optional(),
        userId: z.string().nullable().optional(),
        metaId: z.string().nullable().optional(),
      }),
    ).handler(async ({ req, db }) => {
      authorize(req.context, {
        organizationId: req.input.organizationId,
      });

      const { organizationId, name } = req.input;
      const userId = req.input.userId;
      const metaId = req.input.metaId;

      let existing =
        userId !== undefined && userId !== null
          ? await db.author
              .first({
                userId,
                organizationId,
              })
              .get()
          : null;

      if (!existing && metaId !== undefined && metaId !== null) {
        existing = await db.author
          .first({
            metaId,
            organizationId,
          })
          .get();
      }

      if (existing) {
        return { id: existing.id };
      }

      const id = req.input.id ?? ulid().toLowerCase();

      try {
        await db.author.insert({
          id,
          name,
          userId: userId ?? null,
          metaId: metaId ?? null,
          organizationId,
        });
      } catch (error: unknown) {
        if (!isPostgresUniqueViolation(error)) {
          throw error;
        }

        let after =
          userId !== undefined && userId !== null
            ? await db.author
                .first({
                  userId,
                  organizationId,
                })
                .get()
            : null;

        if (!after && metaId !== undefined && metaId !== null) {
          after = await db.author
            .first({
              metaId,
              organizationId,
            })
            .get();
        }

        if (!after) {
          throw error;
        }

        return { id: after.id };
      }

      return { id };
    }),

    update: mutation(
      z.object({
        id: z.string(),
        name: z.string().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const row = await db.author.one(req.input.id).get();

      if (!row?.organizationId) {
        throw new Error("AUTHOR_NOT_FOUND");
      }

      authorize(req.context, {
        organizationId: row.organizationId,
      });

      const next: { name?: string } = {};

      if (req.input.name !== undefined) {
        next.name = req.input.name;
      }

      if (Object.keys(next).length === 0) {
        return { id: row.id };
      }

      await db.author.update(req.input.id, next);

      return { id: row.id };
    }),
  }));
