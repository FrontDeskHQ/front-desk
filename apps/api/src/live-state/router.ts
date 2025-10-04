import { router as createRouter, routeFactory } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";
import { schema } from "./schema";

const publicRoute = routeFactory();

const privateRoute = publicRoute.use(async ({ req, next }) => {
  if (!req.context.session && !req.context.discordBotKey) {
    throw new Error("Unauthorized");
  }

  return next(req);
});

export const router = createRouter({
  schema,
  routes: {
    organization: publicRoute
      .collectionRoute(schema.organization)
      .withMutations(({ mutation }) => ({
        create: mutation(
          z.object({ name: z.string(), slug: z.string() })
        ).handler(async ({ req, db }) => {
          const organizationId = ulid().toLowerCase();

          await db.insert(schema.organization, {
            id: organizationId,
            name: req.input!.name,
            slug: req.input!.slug,
            createdAt: new Date(),
            logoUrl: null,
          });

          await db.insert(schema.organizationUser, {
            id: ulid().toLowerCase(),
            organizationId,
            userId: req.context.session.userId,
            enabled: true,
            role: "owner",
          });
        }),
      })),
    organizationUser: privateRoute.collectionRoute(schema.organizationUser),
    thread: privateRoute.collectionRoute(schema.thread),
    message: privateRoute.collectionRoute(schema.message),
    user: privateRoute.collectionRoute(schema.user),
    author: privateRoute.collectionRoute(schema.author),
    invite: privateRoute.collectionRoute(schema.invite),
  },
});

export type Router = typeof router;
