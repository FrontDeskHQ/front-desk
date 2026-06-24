// TODO refactor with new live-state mental model
import { router as createRouter } from "@live-state/sync/server";
import { InviteUserEmail } from "@workspace/emails/transactional/org-invitation";
import { organizationSettingsSchema } from "@workspace/schemas/organization";
import {
  type ActionAutonomyMap,
  actionAutonomyMapSchema,
  actionKindSchema,
  autonomyLevelSchema,
  getDefaultActionAutonomy,
  REVERSIBLE_ACTIONS,
} from "@workspace/schemas/signals";
import { addDays, addYears } from "date-fns";
import { ulid } from "ulid";
import { z } from "zod";
import { publicKeys } from "../lib/api-key";
import { authorize } from "../lib/authorize";
import { dodopayments } from "../lib/payment";
import { resend } from "../lib/resend";
import { sendWelcomeEmail } from "../trigger/send-welcome-email";
import { privateRoute, publicRoute } from "./factories";
import { agentChatMessageRoute, agentChatRoute } from "./router/agent-chat";
import autonomousActionRoute from "./router/autonomous-action";
import documentationSourcesRoute from "./router/documentation-sources";
import externalEntityRoute from "./router/external-entity";
import labelsRoute from "./router/labels";
import messageRoute from "./router/message";
import onboardingRoute from "./router/onboarding";
import { slackChannelsCache } from "./router/slack-channels";
import threadsRoute from "./router/threads";
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
          preMutation: () => false,
          postMutation: () => false,
        },
      })
      .withProcedures(({ mutation }) => ({
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
                },
              ),
          }),
        ).handler(async ({ req, db }) => {
          const organizationId = ulid().toLowerCase();

          const dodopaymentsCustomer = await dodopayments?.customers.create({
            email: req.context.user?.email,
            name: req.context.user?.name,
          });

          const organization = await db.insert(schema.organization, {
            id: organizationId,
            name: req.input!.name,
            slug: req.input!.slug,
            createdAt: new Date(),
            logoUrl: null,
            socials: null,
            customInstructions: null,
            settings: {
              timezone: "UTC",
              digest: {
                pendingReplyThresholdMinutes: 30,
                time: "09:00",
                slackChannelId: null,
                slackChannelName: null,
                lastDigestSentAt: null,
              },
              actionAutonomy: getDefaultActionAutonomy(),
            },
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

          // Send welcome email if this is the user's first organization
          const userMemberships = Object.values(
            await db.find(schema.organizationUser, {
              where: {
                userId: req.context.session.userId,
              },
            }),
          );

          if (userMemberships.length === 1) {
            const delayMinutes = Math.floor(Math.random() * 21) + 20;

            sendWelcomeEmail
              .trigger(
                {
                  email: req.context.user!.email,
                  name: req.context.user!.name,
                },
                { delay: `${delayMinutes}m` },
              )
              .catch((err) => {
                console.error("Failed to schedule welcome email", err);
              });
          }

          return {
            success: true,
            organization,
          };
        }),
        setActionAutonomy: mutation(
          z.object({
            organizationId: z.string(),
            actionKind: actionKindSchema,
            level: autonomyLevelSchema,
          }),
        ).handler(async ({ req, db }) => {
          authorize(req, {
            organizationId: req.input.organizationId,
            role: "owner",
          });

          if (
            req.input.level === "auto" &&
            !REVERSIBLE_ACTIONS.has(req.input.actionKind)
          ) {
            throw new Error("ACTION_KIND_LOCKED_FROM_AUTO");
          }

          const org = await db.organization.one(req.input.organizationId).get();
          if (!org) throw new Error("ORGANIZATION_NOT_FOUND");

          // Preserve raw settings — only touch actionAutonomy. Avoid
          // safeParseOrgSettings here because it returns the schema defaults
          // when the existing settings fail validation, which would silently
          // overwrite unrelated keys we don't know about yet.
          const rawSettings =
            org.settings &&
            typeof org.settings === "object" &&
            !Array.isArray(org.settings)
              ? (org.settings as Record<string, unknown>)
              : {};
          const parsedAutonomy = actionAutonomyMapSchema.safeParse(
            rawSettings.actionAutonomy,
          );
          const nextAutonomy: ActionAutonomyMap = {
            ...getDefaultActionAutonomy(),
            ...(parsedAutonomy.success ? parsedAutonomy.data : {}),
            [req.input.actionKind]: req.input.level,
          };

          return db.organization.update(org.id, {
            settings: {
              ...rawSettings,
              actionAutonomy: nextAutonomy,
              // biome-ignore lint/suspicious/noExplicitAny: settings JSON shape is open
            } as any,
          });
        }),
        updateSettings: mutation(
          z
            .object({
              organizationId: z.string(),
              name: z.string().optional(),
              slug: z
                .string()
                .min(4)
                .refine(
                  (slug) => {
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
                  },
                )
                .optional(),
              logoUrl: z.string().nullable().optional(),
              socials: z.string().nullable().optional(),
              customInstructions: z.string().nullable().optional(),
              settings: organizationSettingsSchema.optional(),
            })
            .refine(
              (input) => {
                const { organizationId: _organizationId, ...fields } = input;
                return Object.values(fields).some(
                  (value) => value !== undefined,
                );
              },
              { message: "NO_FIELDS_TO_UPDATE" },
            ),
        ).handler(async ({ req, db }) => {
          authorize(req, {
            organizationId: req.input.organizationId,
            role: "owner",
          });

          const org = await db.organization.one(req.input.organizationId).get();
          if (!org) throw new Error("ORGANIZATION_NOT_FOUND");

          const {
            organizationId: _organizationId,
            name,
            slug,
            logoUrl,
            socials,
            customInstructions,
            settings,
          } = req.input;

          return db.organization.update(org.id, {
            ...(name !== undefined ? { name } : {}),
            ...(slug !== undefined ? { slug } : {}),
            ...(logoUrl !== undefined ? { logoUrl } : {}),
            ...(socials !== undefined ? { socials } : {}),
            ...(customInstructions !== undefined ? { customInstructions } : {}),
            ...(settings !== undefined ? { settings } : {}),
          });
        }),
        createPublicApiKey: mutation(
          z.object({
            organizationId: z.string(),
            expiresAt: z.iso.datetime().optional(),
            name: z.string().optional(),
          }),
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
              }),
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
          }),
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
            }),
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
          }),
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
              }),
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
          preMutation: () => false,
          postMutation: () => false,
        },
      })
      .withProcedures(({ mutation }) => ({
        inviteUser: mutation(
          z.object({
            organizationId: z.string(),
            email: z.email().array(),
          }),
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
            }),
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
            }),
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
            }),
          );

          // TODO follow https://github.com/pedroscosta/live-state/issues/74
          const filteredEmails = Array.from(
            new Set(req.input!.email.map((e) => e.trim().toLowerCase())),
          ).filter(
            (email) =>
              !existingMembers.some(
                (member) => (member as any).user?.email.toLowerCase() === email,
              ) &&
              !existingInvites.some(
                (invite) => (invite as any).email.toLowerCase() === email,
              ),
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
            }),
          );

          return {
            success: true,
          };
        }),
        updateMember: mutation(
          z
            .object({
              organizationUserId: z.string(),
              role: z.enum(["owner", "user"]).optional(),
              enabled: z.boolean().optional(),
            })
            .refine(
              (input) => {
                const { organizationUserId: _organizationUserId, ...fields } =
                  input;
                return Object.values(fields).some(
                  (value) => value !== undefined,
                );
              },
              { message: "NO_FIELDS_TO_UPDATE" },
            ),
        ).handler(async ({ req, db }) => {
          const member = await db.organizationUser
            .one(req.input.organizationUserId)
            .get();
          if (!member) throw new Error("ORGANIZATION_USER_NOT_FOUND");

          authorize(req, {
            organizationId: member.organizationId,
            role: "owner",
          });

          if (
            member.userId === req.context?.session?.userId &&
            (req.input.enabled === false ||
              (req.input.role !== undefined && req.input.role !== member.role))
          ) {
            throw new Error("CANNOT_UPDATE_SELF");
          }

          const { organizationUserId: _organizationUserId, role, enabled } =
            req.input;

          return db.organizationUser.update(member.id, {
            ...(role !== undefined ? { role } : {}),
            ...(enabled !== undefined ? { enabled } : {}),
          });
        }),
      })),
    user: publicRoute
      .collectionRoute(schema.user, {
        read: () => true,
        insert: () => false,
        update: {
          preMutation: () => false,
          postMutation: () => false,
        },
      })
      .withProcedures(({ mutation }) => ({
        updateProfile: mutation(
          z
            .object({
              userId: z.string(),
              name: z.string().optional(),
              email: z.string().optional(),
              image: z.string().nullable().optional(),
            })
            .refine(
              (input) => {
                const { userId: _userId, ...fields } = input;
                return Object.values(fields).some(
                  (value) => value !== undefined,
                );
              },
              { message: "NO_FIELDS_TO_UPDATE" },
            ),
        ).handler(async ({ req, db }) => {
          const isSelf = req.context?.session?.userId === req.input.userId;
          const isInternal = !!req.context?.internalApiKey;

          if (!isSelf && !isInternal) {
            throw new Error("UNAUTHORIZED");
          }

          const existing = await db.user.one(req.input.userId).get();
          if (!existing) throw new Error("USER_NOT_FOUND");

          const { userId: _userId, name, email, image } = req.input;

          return db.user.update(existing.id, {
            ...(name !== undefined ? { name } : {}),
            ...(email !== undefined ? { email } : {}),
            ...(image !== undefined ? { image } : {}),
          });
        }),
      })),
    author: publicRoute.collectionRoute(schema.author, {
      read: () => true,
      insert: () => false,
      update: {
        preMutation: () => false,
        postMutation: () => false,
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
          preMutation: () => false,
          postMutation: () => false,
        },
      })
      .withProcedures(({ mutation }) => ({
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
          },
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
          },
        ),
        revoke: mutation(z.object({ inviteId: z.string() })).handler(
          async ({ req, db }) => {
            const invite = await db.invite.one(req.input.inviteId).get();
            if (!invite) throw new Error("INVITATION_NOT_FOUND");

            authorize(req, {
              organizationId: invite.organizationId,
              role: "owner",
            });

            return db.invite.update(invite.id, { active: false });
          },
        ),
      })),
    integration: privateRoute
      .collectionRoute(schema.integration, {
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
      })
      .withMutations(({ mutation }) => ({
        fetchSlackChannels: mutation(
          z.object({
            organizationId: z.string(),
            teamId: z.string().optional(),
          }),
        ).handler(async ({ req, db }) => {
          const { organizationId, teamId: requestedTeamId } = req.input;

          let authorized = !!req.context?.internalApiKey;

          if (!authorized && req.context?.session?.userId) {
            const selfOrgUser = Object.values(
              await db.find(schema.organizationUser, {
                where: {
                  organizationId,
                  userId: req.context.session.userId,
                  enabled: true,
                },
              }),
            )[0];

            authorized = selfOrgUser?.role === "owner";
          }

          if (!authorized) {
            throw new Error("UNAUTHORIZED");
          }

          const integration = Object.values(
            await db.find(schema.integration, {
              where: {
                organizationId,
                type: "slack",
                enabled: true,
              },
            }),
          )[0];

          if (!integration || !integration.configStr) {
            throw new Error("SLACK_INTEGRATION_NOT_CONFIGURED");
          }

          const config = JSON.parse(integration.configStr);
          const teamId = config?.teamId;

          if (!teamId) {
            throw new Error("SLACK_TEAM_ID_NOT_FOUND");
          }

          if (
            requestedTeamId !== undefined &&
            String(teamId) !== String(requestedTeamId)
          ) {
            throw new Error("SLACK_TEAM_MISMATCH");
          }

          return slackChannelsCache.get({
            organizationId,
            teamId: String(teamId),
          });
        }),
      })),
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
    // Mirror of external issues/PRs. Default mutators are disabled; writes go
    // through the route's custom `upsert` / `softDelete` procedures.
    externalEntity: externalEntityRoute,
    thread: threadsRoute,
    update: updateRoute,
    message: messageRoute,
    autonomousAction: autonomousActionRoute,
    onboarding: onboardingRoute,
    documentationSource: documentationSourcesRoute,
    agentChat: agentChatRoute,
    agentChatMessage: agentChatMessageRoute,
    ...labelsRoute,
    // Internal pipeline tables (not synced to clients, used by worker)
    pipelineIdempotencyKey: publicRoute.collectionRoute(
      schema.pipelineIdempotencyKey,
      {
        read: ({ ctx }) => !!ctx?.internalApiKey,
        insert: ({ ctx }) => !!ctx?.internalApiKey,
        update: {
          preMutation: ({ ctx }) => !!ctx?.internalApiKey,
          postMutation: ({ ctx }) => !!ctx?.internalApiKey,
        },
      },
    ),
    pipelineJob: publicRoute.collectionRoute(schema.pipelineJob, {
      read: ({ ctx }) => !!ctx?.internalApiKey,
      insert: ({ ctx }) => !!ctx?.internalApiKey,
      update: {
        preMutation: ({ ctx }) => !!ctx?.internalApiKey,
        postMutation: ({ ctx }) => !!ctx?.internalApiKey,
      },
    }),
    // Server-only: migration bookkeeping managed by the boot-time runner.
    migration: publicRoute.collectionRoute(schema.migration, {
      read: () => false,
      insert: () => false,
      update: {
        preMutation: () => false,
        postMutation: () => false,
      },
    }),
  },
});

export type Router = typeof router;
