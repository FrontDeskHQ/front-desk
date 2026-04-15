import { ulid } from "ulid";
import { z } from "zod";
import { privateRoute } from "../factories";
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

export const allowlistRoute = privateRoute
  .collectionRoute(schema.allowlist, {
    read: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.user?.email) return false;

      return {
        email: ctx.user.email.toLowerCase(),
      };
    },
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    create: mutation(
      z.object({
        email: z.string().email(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      const email = req.input.email.trim().toLowerCase();

      const existing = await db.allowlist.first({ email }).get();
      if (existing) {
        return { id: existing.id };
      }

      const id = ulid().toLowerCase();

      try {
        await db.allowlist.insert({
          id,
          email,
        });
      } catch (error: unknown) {
        if (!isPostgresUniqueViolation(error)) {
          throw error;
        }

        const after = await db.allowlist.first({ email }).get();
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
        email: z.string().email(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      const row = await db.allowlist.one(req.input.id).get();
      if (!row) {
        throw new Error("ALLOWLIST_ENTRY_NOT_FOUND");
      }

      const email = req.input.email.trim().toLowerCase();

      await db.allowlist.update(req.input.id, {
        email,
      });

      return { id: row.id, email };
    }),
  }));
