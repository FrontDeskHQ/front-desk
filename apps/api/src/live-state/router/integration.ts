import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { privateRoute } from "../factories";
import { schema } from "../schema";
import { slackChannelsCache } from "./slack-channels";

const integrationCreateInput = z.object({
  id: z.string(),
  organizationId: z.string(),
  type: z.string(),
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  configStr: z.string().nullable(),
});

const integrationUpdateInput = z.object({
  id: z.string(),
  type: z.string().optional(),
  enabled: z.boolean().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  configStr: z.string().nullable().optional(),
});

export const integrationRoute = privateRoute
  .collectionRoute(schema.integration, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    create: mutation(integrationCreateInput).handler(async ({ req, db }) => {
      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }

        authorize(req.context, {
          organizationId: req.input.organizationId,
          role: "owner",
        });
      }

      await db.integration.insert({
        id: req.input.id,
        organizationId: req.input.organizationId,
        type: req.input.type,
        enabled: req.input.enabled,
        createdAt: req.input.createdAt,
        updatedAt: req.input.updatedAt,
        configStr: req.input.configStr,
      });

      return { success: true as const };
    }),

    update: mutation(integrationUpdateInput).handler(async ({ req, db }) => {
      const row = await db.integration.one(req.input.id).get();
      if (!row) {
        throw new Error("INTEGRATION_NOT_FOUND");
      }

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }

        authorize(req.context, {
          organizationId: row.organizationId,
          role: "owner",
        });
      }

      const hasField =
        req.input.type !== undefined ||
        req.input.enabled !== undefined ||
        req.input.createdAt !== undefined ||
        req.input.updatedAt !== undefined ||
        req.input.configStr !== undefined;

      if (!hasField) {
        throw new Error("UPDATE_REQUIRES_FIELDS");
      }

      await db.integration.update(req.input.id, {
        ...(req.input.type !== undefined ? { type: req.input.type } : {}),
        ...(req.input.enabled !== undefined ? { enabled: req.input.enabled } : {}),
        ...(req.input.createdAt !== undefined ? { createdAt: req.input.createdAt } : {}),
        ...(req.input.updatedAt !== undefined ? { updatedAt: req.input.updatedAt } : {}),
        ...(req.input.configStr !== undefined ? { configStr: req.input.configStr } : {}),
      });

      return { success: true as const };
    }),

    fetchSlackChannels: mutation(
      z.object({
        organizationId: z.string(),
        teamId: z.string().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const { organizationId, teamId: requestedTeamId } = req.input;

      let authorized = !!req.context?.internalApiKey;

      if (!authorized && req.context?.session?.userId) {
        const selfOrgUser = await db.organizationUser
          .first({
            organizationId,
            userId: req.context.session.userId,
            enabled: true,
          })
          .get();

        authorized = selfOrgUser?.role === "owner";
      }

      if (!authorized) {
        throw new Error("UNAUTHORIZED");
      }

      const integration = await db.integration
        .first({
          organizationId,
          type: "slack",
          enabled: true,
        })
        .get();

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
  }));
