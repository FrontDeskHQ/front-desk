import { router as createRouter, routeFactory } from "@live-state/sync/server";
import { InviteUserEmail } from "@workspace/emails/transactional/org-invitation";
import { addDays } from "date-fns";
import { ulid } from "ulid";
import { z } from "zod";
import { dodopayments } from "../lib/payment";
import { resend } from "../lib/resend";
import { schema } from "./schema";

const publicRoute = routeFactory();

const privateRoute = publicRoute.use(async ({ req, next }) => {
  if (!req.context.session && !req.context.apiKey) {
    throw new Error("Unauthorized");
  }

  return next(req);
});

export const router = createRouter({
  schema,
  routes: {
    // TODO test this
    organization: publicRoute
      .collectionRoute(schema.organization, {
        read: ({ ctx }) => {
          if (ctx?.apiKey) return true;
          if (!ctx?.session) return false;

          return {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          };
        },
        insert: () => false,
        update: {
          preMutation: ({ ctx }) => {
            console.log("preMutation", ctx?.session?.userId);
            if (ctx?.apiKey) return true;
            if (!ctx?.session) return false;

            return {
              organizationUsers: {
                userId: ctx.session.userId,
                role: "owner",
                enabled: true,
              },
            };
          },
          postMutation: ({ ctx }) => {
            if (ctx?.apiKey) return true;
            if (!ctx?.session) return false;

            return {
              organizationUsers: {
                userId: ctx.session.userId,
                role: "owner",
                enabled: true,
              },
            };
          },
        },
      })
      .withMutations(({ mutation }) => ({
        create: mutation(
          z.object({ name: z.string(), slug: z.string() })
        ).handler(async ({ req, db }) => {
          const organizationId = ulid().toLowerCase();

          const dodopaymentsCustomer = await dodopayments?.customers.create({
            email: req.context.user?.email,
            name: req.context.user?.name,
          });

          await db.insert(schema.organization, {
            id: organizationId,
            name: req.input!.name,
            slug: req.input!.slug,
            createdAt: new Date(),
            logoUrl: null,
          });

          await db.insert(schema.subscription, {
            id: ulid().toLowerCase(),
            organizationId,
            customerId: dodopaymentsCustomer?.customer_id ?? null,
            subscriptionId: null,
            plan: "trial",
            status: null,
            createdAt: new Date(),
            updatedAt: new Date(),
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
    // TODO test this
    organizationUser: privateRoute
      .collectionRoute(schema.organizationUser, {
        read: () => true,
        insert: () => false,
        update: {
          preMutation: ({ ctx }) => {
            if (ctx?.apiKey) return true;
            if (!ctx?.session) return false;

            return {
              organization: {
                organizationUsers: {
                  userId: ctx.session.userId,
                  enabled: true,
                  role: "owner",
                },
              },
            };
          },
          postMutation: ({ ctx }) => {
            if (ctx?.apiKey) return true;
            if (!ctx?.session) return false;

            return {
              organization: {
                organizationUsers: {
                  userId: ctx.session.userId,
                  enabled: true,
                  role: "owner",
                },
              },
            };
          },
        },
      })
      .withMutations(({ mutation }) => ({
        inviteUser: mutation(
          z.object({
            organizationId: z.string(),
            email: z.email().array(),
          })
        ).handler(async ({ req, db }) => {
          const orgId = req.input!.organizationId;

          // FIXME follow https://github.com/pedroscosta/live-state/issues/74
          const selfOrgUser = Object.values(
            await db.find(schema.organizationUser, {
              where: {
                organizationId: orgId,
                userId: req.context.session.userId,
              },
              include: {
                user: true,
                organization: true,
              },
            })
          )[0] as any;

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
                active: true,
                expiresAt: {
                  $gt: new Date(),
                },
              },
            })
          );

          // FIXME follow https://github.com/pedroscosta/live-state/issues/74
          const filteredEmails = Array.from(
            new Set(req.input!.email.map((e) => e.trim().toLowerCase()))
          ).filter(
            (email) =>
              !existingMembers.some(
                (member) => (member as any).user?.email.toLowerCase() === email
              ) &&
              !existingInvites.some(
                (invite) => (invite as any).email.toLowerCase() === email
              )
          );

          await Promise.allSettled(
            filteredEmails.map(async (email) => {
              const inviteId = ulid().toLowerCase();
              await db.insert(schema.invite, {
                id: inviteId,
                organizationId: req.input!.organizationId,
                creatorId: req.context.session.userId,
                email,
                createdAt: new Date(),
                expiresAt: addDays(new Date(), 7),
                active: true,
              });

              await resend.emails
                .send({
                  from: "FrontDesk <notifications@tryfrontdesk.app>",
                  to: [email],
                  subject: `${selfOrgUser.user.name} invited you to join ${selfOrgUser.organization.name} on FrontDesk`,
                  react: InviteUserEmail({
                    invitedByName: selfOrgUser.user.name,
                    organizationName: selfOrgUser.organization.name,
                    organizationImage: selfOrgUser.organization.logoUrl,
                    inviteLink: `https://tryfrontdesk.app/app/invitation/${inviteId}`,
                  }),
                })
                .catch((error) => {
                  console.error("Error sending email", error);
                });
            })
          );

          return {
            success: true,
          };
        }),
      })),
    // TODO test this
    thread: publicRoute.collectionRoute(schema.thread, {
      read: () => true,
      insert: ({ ctx }) => {
        if (ctx?.apiKey) return true;
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
      update: {
        preMutation: ({ ctx }) => !!ctx?.apiKey,
        postMutation: ({ ctx }) => !!ctx?.apiKey,
      },
    }),
    // TODO test this
    message: publicRoute.collectionRoute(schema.message, {
      read: () => true,
      insert: ({ ctx }) => {
        if (ctx?.apiKey) return true;
        if (!ctx?.session) return false;

        return {
          thread: {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
              },
            },
          },
        };
      },
      update: {
        preMutation: ({ ctx }) => !!ctx?.apiKey,
        postMutation: ({ ctx }) => !!ctx?.apiKey,
      },
    }),
    // TODO test this
    user: privateRoute.collectionRoute(schema.user, {
      read: () => true,
      insert: () => false,
      update: {
        preMutation: ({ ctx }) => {
          if (ctx?.apiKey) return true;
          if (!ctx?.session) return false;

          return {
            id: ctx.session.userId,
          };
        },
        postMutation: ({ ctx }) => {
          if (ctx?.apiKey) return true;
          if (!ctx?.session) return false;

          return {
            id: ctx.session.userId,
          };
        },
      },
    }),
    // TODO test this
    author: privateRoute.collectionRoute(schema.author, {
      read: () => true,
      insert: ({ ctx }) => {
        if (ctx?.apiKey) return true;
        if (!ctx?.session) return false;

        return {
          userId: ctx.session.userId,
        };
      },
      update: {
        preMutation: ({ ctx }) => !!ctx?.apiKey,
        postMutation: ({ ctx }) => !!ctx?.apiKey,
      },
    }),
    // TODO test this
    invite: privateRoute
      .collectionRoute(schema.invite, {
        read: ({ ctx }) => {
          if (ctx?.apiKey) return true;
          if (!ctx?.session) return false;

          return {
            $or: [
              {
                organization: {
                  organizationUsers: {
                    userId: ctx.session.userId,
                    enabled: true,
                  },
                },
              },
              {
                email: ctx?.user?.email,
              },
            ],
          };
        },
        insert: () => false,
        update: {
          preMutation: ({ ctx }) => {
            if (ctx?.apiKey) return true;
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
          postMutation: ({ ctx }) => {
            if (ctx?.apiKey) return true;
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
        },
      })
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
    // TODO test this
    integration: privateRoute.collectionRoute(schema.integration, {
      read: () => true,
      insert: () => false,
      update: {
        preMutation: ({ ctx }) => {
          if (ctx?.apiKey) return true;
          if (!ctx?.session) return false;

          return {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
                role: "owner",
              },
            },
          };
        },
        postMutation: ({ ctx }) => {
          if (ctx?.apiKey) return true;
          if (!ctx?.session) return false;

          return {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
                role: "owner",
              },
            },
          };
        },
      },
    }),
    allowlist: privateRoute.collectionRoute(schema.allowlist, {
      read: ({ ctx }) => !!ctx?.apiKey,
      insert: ({ ctx }) => !!ctx?.apiKey,
      update: {
        preMutation: ({ ctx }) => !!ctx?.apiKey,
        postMutation: ({ ctx }) => !!ctx?.apiKey,
      },
    }),
    subscription: privateRoute.collectionRoute(schema.subscription, {
      read: ({ ctx }) => {
        if (ctx?.apiKey) return true;
        if (!ctx?.session) return false;

        return {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
              role: "owner",
            },
          },
        };
      },
      insert: () => false,
      update: {
        preMutation: ({ ctx }) => !!ctx?.apiKey,
        postMutation: ({ ctx }) => !!ctx?.apiKey,
      },
    }),
  },
});

export type Router = typeof router;
