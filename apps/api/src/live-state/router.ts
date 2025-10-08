import { router as createRouter, routeFactory } from "@live-state/sync/server";
import { addDays } from "date-fns";
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
    organizationUser: privateRoute
      .collectionRoute(schema.organizationUser)
      .withMutations(({ mutation }) => ({
        inviteUser: mutation(
          z.object({
            organizationId: z.string(),
            email: z.email().array(),
          })
        ).handler(async ({ req, db }) => {
          const orgId = req.input!.organizationId;

          const selfOrgUser = Object.values(
            await db.find(schema.organizationUser, {
              where: {
                organizationId: orgId,
                userId: req.context.session.userId,
              },
              include: {
                user: true,
              },
            })
          )[0];

          if (!selfOrgUser || selfOrgUser.role !== "owner") {
            throw new Error("UNAUTHORIZED");
          }

          const existingMembers = Object.values(
            await db.find(schema.organizationUser, {
              where: {
                organizationId: orgId,
              },
              include: {
                user: true,
              },
            })
          );

          const existingInvites = Object.values(
            await db.find(schema.invite, {
              where: {
                organizationId: orgId,
              },
            })
          );

          // FIXME follow https://github.com/pedroscosta/live-state/issues/74
          const filteredEmails = req.input!.email.filter(
            (email) =>
              !existingMembers.some(
                (member) => (member as any).user?.email === email
              ) &&
              !existingInvites.some((invite) => (invite as any).email === email)
          );

          await Promise.allSettled(
            filteredEmails.map(async (email) => {
              await db.insert(schema.invite, {
                id: ulid().toLowerCase(),
                organizationId: req.input!.organizationId,
                creatorId: req.context.session.userId,
                email,
                createdAt: new Date(),
                expiresAt: addDays(new Date(), 7),
                active: true,
              });
            })
          );

          return {
            success: true,
          };
        }),
      })),
    thread: privateRoute.collectionRoute(schema.thread),
    message: privateRoute.collectionRoute(schema.message),
    user: privateRoute.collectionRoute(schema.user),
    author: privateRoute.collectionRoute(schema.author),
    invite: privateRoute
      .collectionRoute(schema.invite)
      .withMutations(({ mutation }) => ({
        accept: mutation(z.object({ id: z.string() })).handler(
          async ({ req, db }) => {
            await db.transaction(async ({ trx }) => {
              const invite = await trx.findOne(schema.invite, req.input!.id);

              if (!invite) {
                throw new Error("INVITATION_NOT_FOUND");
              }

              if (invite.email !== req.context?.user?.email) {
                throw new Error("INVALID_USER");
              }

              await trx.insert(schema.organizationUser, {
                id: ulid().toLowerCase(),
                organizationId: invite.organizationId,
                userId: req.context.session.userId,
                enabled: true,
                role: "user",
              });

              await trx.update(schema.invite, req.input!.id, {
                active: false,
              });
            });

            return {
              success: true,
            };
          }
        ),
        decline: mutation(z.object({ id: z.string() })).handler(
          async ({ req, db }) => {
            const invite = await db.findOne(schema.invite, req.input!.id);

            if (!invite) {
              throw new Error("INVITATION_NOT_FOUND");
            }

            if (invite.email !== req.context?.user?.email) {
              throw new Error("INVALID_USER");
            }

            await db.update(schema.invite, req.input!.id, {
              active: false,
            });

            return {
              success: true,
            };
          }
        ),
      })),
  },
});

export type Router = typeof router;
