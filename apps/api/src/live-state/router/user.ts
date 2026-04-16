import { z } from "zod";
import { publicRoute } from "../factories";
import { schema } from "../schema";

export const userRoute = publicRoute
  .collectionRoute(schema.user, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    update: mutation(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        image: z.string().nullable().optional(),
      }),
    ).handler(async ({ req, db }) => {
      if (req.context.internalApiKey) {
        const row = await db.user.one(req.input.id).get();
        if (!row) {
          throw new Error("USER_NOT_FOUND");
        }

        await db.user.update(req.input.id, {
          ...(req.input.name !== undefined ? { name: req.input.name } : {}),
          ...(req.input.email !== undefined ? { email: req.input.email } : {}),
          ...(req.input.image !== undefined ? { image: req.input.image } : {}),
        });

        return { success: true as const };
      }

      if (!req.context.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      if (req.input.id !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const row = await db.user.one(req.input.id).get();
      if (!row) {
        throw new Error("USER_NOT_FOUND");
      }

      await db.user.update(req.input.id, {
        ...(req.input.name !== undefined ? { name: req.input.name } : {}),
        ...(req.input.email !== undefined ? { email: req.input.email } : {}),
        ...(req.input.image !== undefined ? { image: req.input.image } : {}),
      });

      return { success: true as const };
    }),
  }));
