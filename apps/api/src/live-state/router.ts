import { router as createRouter } from "@live-state/sync/server";
import { InviteUserEmail } from "@workspace/emails/transactional/org-invitation";
import { addDays, addYears } from "date-fns";
import { ulid } from "ulid";
import { z } from "zod";
import { publicKeys } from "../lib/api-key";
import { dodopayments } from "../lib/payment";
import { resend } from "../lib/resend";
import { privateRoute, publicRoute } from "./factories";
import labelsRoute from "./router/labels";
import updateRoute from "./router/update";
import { schema } from "./schema";

export const router = createRouter({
  schema,
  routes: {
    organization: publicRoute
      .collectionRoute(schema.organization, {
        read: () => true,
        insert: () => false,
        update: {
          preMutation: ({ ctx }) => {
            if (ctx?.internalApiKey) return true;
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
            if (ctx?.internalApiKey) return true;
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
          z.object({
            name: z.string(),
            slug: z
              .string()
              .min(4)
              .refine(
                (slug) => {
                  // TODO: Unify reserved slugs list - extract to shared constant
                  const reservedSlugs = [
                    "support",
                    "help",
                    "status",
                    "api",
                    "admin",
                    "www",
                    "app",
                    "dashboard",
                    "login",
                    "signup",
                    "register",
                    "account",
                    "settings",
                    "billing",
                    "docs",
                    "documentation",
                    "blog",
                    "about",
                    "contact",
                    "privacy",
                    "terms",
                    "legal",
                  ];
                  return !reservedSlugs.includes(slug.toLowerCase());
                },
                {
                  message: "This slug is reserved and cannot be used",
                }
              ),
          })
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
            socials: null,
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
        createPublicApiKey: mutation(
          z.object({
            organizationId: z.string(),
            expiresAt: z.iso.datetime().optional(),
            name: z.string().optional(),
          })
        ).handler(async ({ req, db }) => {
          const organizationId = req.input.organizationId;

          let authorized = !!req.context?.internalApiKey;

          if (!authorized && req.context?.session?.userId) {
            const selfOrgUser = Object.values(
              await db.find(schema.organizationUser, {
                where: {
                  organizationId,
                  userId: req.context.session.userId,
                },
                include: {
                  user: true,
                  organization: true,
                },
              })
            )[0] as any;

            authorized = selfOrgUser && selfOrgUser.role === "owner";
          }

          if (!authorized) {
            throw new Error("UNAUTHORIZED");
          }

          const publicApiKey = await publicKeys.create({
            ownerId: organizationId,
            tags: ["organization"],
            expiresAt:
              req.input.expiresAt ?? addYears(new Date(), 1).toISOString(),
            name: req.input.name,
          });

          return {
            id: publicApiKey.record.id,
            key: publicApiKey.key,
            expiresAt: publicApiKey.record.metadata.expiresAt,
            name: publicApiKey.record.metadata.name,
          };
        }),
        revokePublicApiKey: mutation(
          z.object({
            id: z.string(),
          })
        ).handler(async ({ req, db }) => {
          if (!req.context?.session?.userId) {
            throw new Error("UNAUTHORIZED");
          }

          const publicApiKey = await publicKeys.findById(req.input.id);

          if (!publicApiKey) {
            throw new Error("PUBLIC_API_KEY_NOT_FOUND");
          }

          const selfOrgUser = Object.values(
            await db.find(schema.organizationUser, {
              where: {
                organizationId: publicApiKey.metadata.ownerId,
                userId: req.context.session.userId,
              },
            })
          )[0] as any;

          if (!selfOrgUser || selfOrgUser.role !== "owner") {
            throw new Error("UNAUTHORIZED");
          }

          await publicKeys.revoke(publicApiKey.id).catch((error) => {
            console.error("Error revoking public API key", error);
            throw new Error("FAILED_TO_REVOKE_PUBLIC_API_KEY");
          });

          return {
            success: true,
          };
        }),
        listApiKeys: mutation(
          z.object({
            organizationId: z.string(),
          })
        ).handler(async ({ req, db }) => {
          const organizationId = req.input.organizationId;

          let authorized = !!req.context?.internalApiKey;

          if (!authorized && req.context?.session?.userId) {
            const selfOrgUser = Object.values(
              await db.find(schema.organizationUser, {
                where: {
                  organizationId,
                  userId: req.context.session.userId,
                },
              })
            )[0] as any;

            authorized = selfOrgUser && selfOrgUser.role === "owner";
          }

          if (!authorized) {
            throw new Error("UNAUTHORIZED");
          }

          const apiKeys = await publicKeys.list(organizationId);

          return apiKeys
            .filter((apiKey) => !apiKey.metadata.revokedAt)
            .map((apiKey) => ({
              id: apiKey.id,
              expiresAt: apiKey.metadata.expiresAt,
              name: apiKey.metadata.name,
              type: "public",
              createdAt: apiKey.metadata.createdAt,
            }));
        }),
      })),
    organizationUser: privateRoute
      .collectionRoute(schema.organizationUser, {
        read: () => true,
        insert: () => false,
        update: {
          preMutation: ({ ctx }) => {
            if (ctx?.internalApiKey) return true;
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
            if (ctx?.internalApiKey) return true;
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

          // TODO follow https://github.com/pedroscosta/live-state/issues/74
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

          // TODO follow https://github.com/pedroscosta/live-state/issues/74
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
    thread: publicRoute
      .collectionRoute(schema.thread, {
        read: () => true,
        insert: ({ ctx }) => {
          if (ctx?.internalApiKey) return true;
          if (!ctx?.session && !ctx?.portalSession?.session) return false;

          return {
            organization: {
              organizationUsers: {
                userId:
                  ctx.session?.userId ?? ctx.portalSession?.session.userId,
                enabled: true,
              },
            },
          };
        },
        update: {
          preMutation: ({ ctx }) => {
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
          postMutation: ({ ctx }) => {
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
        },
      })
      .withMutations(({ mutation }) => ({
        create: mutation(
          z.object({
            organizationId: z.string().optional(),
            title: z.string().min(3),
            message: z.union([z.string(), z.any()]), // Accept string or TipTap JSONContent
            author: z
              .object({
                id: z.string(),
                name: z.string(),
              })
              .optional(), // Optional - can be inferred from session
            userId: z.string().optional(), // For portal sessions
            userName: z.string().optional(), // For portal sessions
          })
        ).handler(async ({ req, db }) => {
          // Support internal API key, public API key, or portal session
          if (
            !req.context?.internalApiKey &&
            !req.context?.publicApiKey &&
            !req.context?.portalSession?.session
          ) {
            throw new Error("UNAUTHORIZED");
          }

          // Determine organization ID
          const organizationId =
            req.context?.publicApiKey?.ownerId ?? req.input.organizationId;

          if (!organizationId) {
            throw new Error("MISSING_ORGANIZATION_ID");
          }

          // For portal sessions, verify the user matches
          if (req.context?.portalSession?.session) {
            const sessionUserId = req.context.portalSession.session.userId;
            if (req.input.userId && req.input.userId !== sessionUserId) {
              throw new Error("UNAUTHORIZED");
            }
          }

          // Convert string message to TipTap format if needed
          const content =
            typeof req.input.message === "string"
              ? JSON.stringify([
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: req.input.message }],
                  },
                ])
              : JSON.stringify(req.input.message);

          const threadId = ulid().toLowerCase();

          await db.transaction(async ({ trx }) => {
            let authorId: string;

            // Determine author based on context
            if (req.input.userId || req.context?.portalSession?.session) {
              // Portal session flow - use userId
              const userId =
                req.input.userId ??
                req.context?.portalSession?.session.userId;
              const userName =
                req.input.userName ??
                req.context?.portalSession?.session.userName ??
                "Unknown User";

              const existingAuthor = Object.values(
                await trx.find(schema.author, {
                  where: {
                    userId: userId,
                    organizationId: organizationId,
                  },
                })
              );

              authorId = existingAuthor[0]?.id;

              if (!authorId) {
                authorId = ulid().toLowerCase();
                await trx.insert(schema.author, {
                  id: authorId,
                  userId: userId,
                  metaId: null,
                  name: userName,
                  organizationId: organizationId,
                });
              }
            } else if (req.input.author) {
              // API key flow - use metaId
              const existingAuthor = Object.values(
                await trx.find(schema.author, {
                  where: {
                    metaId: req.input.author.id,
                    organizationId: organizationId,
                  },
                })
              );

              authorId = existingAuthor[0]?.id;

              if (!authorId) {
                authorId = ulid().toLowerCase();
                await trx.insert(schema.author, {
                  id: authorId,
                  name: req.input.author.name,
                  organizationId: organizationId,
                  metaId: req.input.author.id,
                  userId: null,
                });
              }
            } else {
              throw new Error("MISSING_AUTHOR_INFO");
            }

            // Create thread
            await trx.insert(schema.thread, {
              id: threadId,
              name: req.input.title,
              organizationId: organizationId,
              authorId: authorId,
              status: 0,
              priority: 0,
              assignedUserId: null,
              createdAt: new Date(),
              deletedAt: null,
              discordChannelId: null,
            });

            // Create first message
            await trx.insert(schema.message, {
              id: ulid().toLowerCase(),
              authorId: authorId,
              content: content,
              threadId: threadId,
              createdAt: new Date(),
              origin: null,
              externalMessageId: null,
            });
          });

          const thread = Object.values(
            await db.find(schema.thread, {
              where: { id: threadId },
              include: {
                author: true,
                messages: {
                  author: true,
                },
              },
            })
          )[0];

          return thread;
        }),
      })),
    message: publicRoute
      .collectionRoute(schema.message, {
        read: () => true,
        insert: ({ ctx }) => {
          if (ctx?.internalApiKey) return true;

          if (ctx?.publicApiKey) {
            return {
              thread: {
                organization: {
                  id: ctx.publicApiKey.ownerId,
                },
              },
            };
          }

          if (!ctx?.session && !ctx?.portalSession?.session) return false;

          return {
            thread: {
              organization: {
                organizationUsers: {
                  userId:
                    ctx.session?.userId ?? ctx.portalSession?.session.userId,
                  enabled: true,
                },
              },
            },
          };
        },
        update: {
          preMutation: ({ ctx }) => !!ctx?.internalApiKey,
          postMutation: ({ ctx }) => !!ctx?.internalApiKey,
        },
      })
      .withMutations(({ mutation }) => ({
        create: mutation(
          z.object({
            threadId: z.string(),
            content: z.union([z.string(), z.any()]), // Accept string or TipTap JSONContent
            userId: z.string().optional(),
            userName: z.string().optional(),
            organizationId: z.string(),
          })
        ).handler(async ({ req, db }) => {
          // Support portal session or internal API key
          if (
            !req.context?.portalSession?.session &&
            !req.context?.internalApiKey
          ) {
            throw new Error("UNAUTHORIZED");
          }

          // For portal sessions, verify the user matches
          if (req.context?.portalSession?.session) {
            const sessionUserId = req.context.portalSession.session.userId;
            if (req.input.userId && req.input.userId !== sessionUserId) {
              throw new Error("UNAUTHORIZED");
            }
          }

          // Verify thread exists and belongs to the expected organization
          const thread = await db.findOne(schema.thread, req.input.threadId);
          if (!thread || thread.organizationId !== req.input.organizationId) {
            throw new Error("THREAD_NOT_FOUND");
          }

          // Convert string content to TipTap format if needed
          const content =
            typeof req.input.content === "string"
              ? JSON.stringify([
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: req.input.content }],
                  },
                ])
              : JSON.stringify(req.input.content);

          const messageId = ulid().toLowerCase();

          await db.transaction(async ({ trx }) => {
            // Get or create author
            const userId =
              req.input.userId ??
              req.context?.portalSession?.session.userId;
            const userName =
              req.input.userName ??
              req.context?.portalSession?.session.userName ??
              "Unknown User";

            const existingAuthor = Object.values(
              await trx.find(schema.author, {
                where: {
                  userId: userId,
                  organizationId: req.input.organizationId,
                },
              })
            );

            let authorId = existingAuthor[0]?.id;

            if (!authorId) {
              authorId = ulid().toLowerCase();
              await trx.insert(schema.author, {
                id: authorId,
                userId: userId,
                metaId: null,
                name: userName,
                organizationId: req.input.organizationId,
              });
            }

            // Create message
            await trx.insert(schema.message, {
              id: messageId,
              authorId: authorId,
              content: content,
              threadId: req.input.threadId,
              createdAt: new Date(),
              origin: null,
              externalMessageId: null,
            });
          });

          const message = Object.values(
            await db.find(schema.message, {
              where: { id: messageId },
              include: {
                author: true,
              },
            })
          )[0];

          return message;
        }),
      })),
    user: privateRoute.collectionRoute(schema.user, {
      read: () => true,
      insert: () => false,
      update: {
        preMutation: ({ ctx }) => {
          if (ctx?.internalApiKey) return true;
          if (!ctx?.session) return false;

          return {
            id: ctx.session.userId,
          };
        },
        postMutation: ({ ctx }) => {
          if (ctx?.internalApiKey) return true;
          if (!ctx?.session) return false;

          return {
            id: ctx.session.userId,
          };
        },
      },
    }),
    author: publicRoute.collectionRoute(schema.author, {
      read: () => true,
      insert: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;

        if (!ctx?.session && !ctx?.portalSession?.session) return false;

        return true;
        // TODO FRO-68: Figure a good way to handle this
        // return {
        //   userId: ctx.session.userId,
        // };
      },
      update: {
        preMutation: ({ ctx }) => !!ctx?.internalApiKey,
        postMutation: ({ ctx }) => !!ctx?.internalApiKey,
      },
    }),
    invite: privateRoute
      .collectionRoute(schema.invite, {
        read: ({ ctx }) => {
          if (ctx?.internalApiKey) return true;
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
          postMutation: ({ ctx }) => {
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

            if (req.context?.user?.email) {
              try {
                await db.insert(schema.allowlist, {
                  id: ulid().toLowerCase(),
                  email: req.context.user.email.toLowerCase(),
                });
              } catch {
                // Silently ignore errors (e.g., duplicate email)
              }
            }

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
    integration: privateRoute.collectionRoute(schema.integration, {
      read: () => true,
      insert: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
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
      update: {
        preMutation: ({ ctx }) => {
          if (ctx?.internalApiKey) return true;
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
          if (ctx?.internalApiKey) return true;
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
      read: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
        if (!ctx?.user?.email) return false;

        return {
          email: ctx.user.email.toLowerCase(),
        };
      },
      insert: ({ ctx }) => !!ctx?.internalApiKey,
      update: {
        preMutation: ({ ctx }) => !!ctx?.internalApiKey,
        postMutation: ({ ctx }) => !!ctx?.internalApiKey,
      },
    }),
    subscription: privateRoute.collectionRoute(schema.subscription, {
      read: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
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
        preMutation: ({ ctx }) => !!ctx?.internalApiKey,
        postMutation: ({ ctx }) => !!ctx?.internalApiKey,
      },
    }),
    update: updateRoute,
    ...labelsRoute,
  },
});

export type Router = typeof router;
