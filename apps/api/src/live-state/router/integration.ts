import { ulid } from "ulid";
import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { privateRoute } from "../factories";
import { schema } from "../schema";
import { slackChannelsCache } from "./slack-channels";

const connectInstallationInputSchema = z.object({
  organizationId: z.string(),
  type: z.string(),
  enabled: z.boolean().optional(),
  configStr: z.string().nullable().optional(),
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

const updateInstallationInputSchema = z
  .object({
    integrationId: z.string(),
    enabled: z.boolean().optional(),
    configStr: z.string().nullable().optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .refine(
    (input) => {
      const { integrationId: _integrationId, ...fields } = input;
      return Object.values(fields).some((value) => value !== undefined);
    },
    { message: "NO_FIELDS_TO_UPDATE" },
  );

export default privateRoute
  .collectionRoute(schema.integration, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    connectInstallation: mutation(connectInstallationInputSchema).handler(
      async ({ req, db }) => {
        const { organizationId, type, enabled, configStr, id, createdAt, updatedAt } =
          req.input;

        authorize(req, { organizationId, role: "owner" });

        const now = new Date();
        const row = await db.insert(schema.integration, {
          id: id ?? ulid().toLowerCase(),
          organizationId,
          type,
          enabled: enabled ?? false,
          configStr: configStr ?? null,
          createdAt: createdAt ?? now,
          updatedAt: updatedAt ?? now,
        });

        return row;
      },
    ),

    updateInstallation: mutation(updateInstallationInputSchema).handler(
      async ({ req, db }) => {
        const integration = await db.integration
          .one(req.input.integrationId)
          .get();
        if (!integration) throw new Error("INTEGRATION_NOT_FOUND");

        authorize(req, {
          organizationId: integration.organizationId,
          role: "owner",
        });

        const { integrationId, ...patch } = req.input;
        const updatedAt = patch.updatedAt ?? new Date();

        return db.update(schema.integration, integrationId, {
          ...patch,
          updatedAt,
        });
      },
    ),

    fetchSlackChannels: mutation(
      z.object({
        organizationId: z.string(),
        teamId: z.string().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const { organizationId, teamId: requestedTeamId } = req.input;

      authorize(req, { organizationId, role: "owner" });

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
  }));
