import { router as createRouter } from "@live-state/sync/server";
import { addYears } from "date-fns";
import { ulid } from "ulid";
import { z } from "zod";
import { publicKeys } from "../lib/api-key";
import { dodopayments } from "../lib/payment";
import { sendWelcomeEmail } from "../trigger/send-welcome-email";
import { privateRoute, publicRoute } from "./factories";
import { agentChatMessageRoute, agentChatRoute } from "./router/agent-chat";
import { allowlistRoute } from "./router/allowlist";
import { authorRoute } from "./router/author";
import documentationSourcesRoute from "./router/documentation-sources";
import { inviteRoute } from "./router/invite";
import labelsRoute from "./router/labels";
import messageRoute from "./router/message";
import onboardingRoute from "./router/onboarding";
import { organizationUserRoute } from "./router/organization-user";
import { slackChannelsCache } from "./router/slack-channels";
import { subscriptionRoute } from "./router/subscription";
import suggestionRoute from "./router/suggestions";
import threadsRoute from "./router/threads";
import updateRoute from "./router/update";
import { userRoute } from "./router/user";
import { schema } from "./schema";

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
          });

          await db.subscription.insert({
            id: ulid().toLowerCase(),
            organizationId,
            customerId: dodopaymentsCustomer?.customer_id ?? null,
            subscriptionId: null,
            plan: "trial",
            status: null,
            seats: 1,
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
    organizationUser: organizationUserRoute,
    user: userRoute,
    author: authorRoute,
    invite: inviteRoute,
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
    allowlist: allowlistRoute,
    subscription: subscriptionRoute,
    thread: threadsRoute,
    update: updateRoute,
    message: messageRoute,
    suggestion: suggestionRoute,
    onboarding: onboardingRoute,
    documentationSource: documentationSourcesRoute,
    agentChat: agentChatRoute,
    agentChatMessage: agentChatMessageRoute,
    ...labelsRoute,
    // Internal pipeline tables (not synced to clients, used by worker)
    pipelineIdempotencyKey: publicRoute
      .collectionRoute(schema.pipelineIdempotencyKey, {
        read: ({ ctx }) => !!ctx?.internalApiKey,
        insert: () => false,
        update: {
          preMutation: () => false,
          postMutation: () => false,
        },
      })
      .withProcedures(({ mutation }) => ({
        upsert: mutation(
          z.object({
            key: z.string(),
            hash: z.string(),
          }),
        ).handler(async ({ req, db }) => {
          if (!req.context?.internalApiKey) {
            throw new Error("UNAUTHORIZED");
          }

          const now = new Date();
          const key = req.input.key;
          const hash = req.input.hash;

          await db.transaction(async ({ trx }) => {
            const rows = await trx.find(schema.pipelineIdempotencyKey, {
              where: { key },
            });
            const existing = Object.values(rows)[0];

            if (existing) {
              await trx.update(schema.pipelineIdempotencyKey, existing.id, {
                hash,
                createdAt: now,
              });
              return;
            }

            try {
              await trx.insert(schema.pipelineIdempotencyKey, {
                id: ulid().toLowerCase(),
                key,
                hash,
                createdAt: now,
              });
            } catch (error: unknown) {
              if (!isPostgresUniqueViolation(error)) {
                throw error;
              }

              const afterRows = await trx.find(schema.pipelineIdempotencyKey, {
                where: { key },
              });
              const row = Object.values(afterRows)[0];
              if (!row) {
                throw error;
              }

              await trx.update(schema.pipelineIdempotencyKey, row.id, {
                hash,
                createdAt: now,
              });
            }
          });

          return { success: true as const };
        }),

        invalidate: mutation(
          z.object({
            key: z.string(),
          }),
        ).handler(async ({ req, db }) => {
          if (!req.context?.internalApiKey) {
            throw new Error("UNAUTHORIZED");
          }

          const key = req.input.key;

          await db.transaction(async ({ trx }) => {
            const rows = await trx.find(schema.pipelineIdempotencyKey, {
              where: { key },
            });
            const existing = Object.values(rows)[0];

            if (!existing) {
              return;
            }

            await trx.update(schema.pipelineIdempotencyKey, existing.id, {
              hash: "",
              createdAt: new Date(),
            });
          });

          return { success: true as const };
        }),
      })),

    pipelineJob: publicRoute
      .collectionRoute(schema.pipelineJob, {
        read: ({ ctx }) => !!ctx?.internalApiKey,
        insert: () => false,
        update: {
          preMutation: () => false,
          postMutation: () => false,
        },
      })
      .withProcedures(({ mutation }) => ({
        create: mutation(
          z.object({
            id: z.string(),
            name: z.string(),
            status: z.string(),
            metadataStr: z.string().nullable(),
            createdAt: z.coerce.date(),
            updatedAt: z.coerce.date(),
          }),
        ).handler(async ({ req, db }) => {
          if (!req.context?.internalApiKey) {
            throw new Error("UNAUTHORIZED");
          }

          await db.insert(schema.pipelineJob, {
            id: req.input.id,
            name: req.input.name,
            status: req.input.status,
            metadataStr: req.input.metadataStr,
            createdAt: req.input.createdAt,
            updatedAt: req.input.updatedAt,
          });

          return { success: true as const };
        }),

        update: mutation(
          z.object({
            id: z.string(),
            status: z.string(),
            metadataStr: z.string().nullable(),
            updatedAt: z.coerce.date(),
          }),
        ).handler(async ({ req, db }) => {
          if (!req.context?.internalApiKey) {
            throw new Error("UNAUTHORIZED");
          }

          const job = await db.findOne(schema.pipelineJob, req.input.id);
          if (!job) {
            throw new Error("PIPELINE_JOB_NOT_FOUND");
          }

          await db.update(schema.pipelineJob, req.input.id, {
            status: req.input.status,
            metadataStr: req.input.metadataStr,
            updatedAt: req.input.updatedAt,
          });

          return { success: true as const };
        }),
      })),
  },
});

export type Router = typeof router;
