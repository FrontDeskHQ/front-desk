import { router as createRouter } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";
import { privateRoute, publicRoute } from "./factories";
import { agentChatMessageRoute, agentChatRoute } from "./router/agent-chat";
import { allowlistRoute } from "./router/allowlist";
import { authorRoute } from "./router/author";
import documentationSourcesRoute from "./router/documentation-sources";
import { inviteRoute } from "./router/invite";
import labelsRoute from "./router/labels";
import messageRoute from "./router/message";
import onboardingRoute from "./router/onboarding";
import { organizationRoute } from "./router/organization";
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
    organization: organizationRoute,
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
