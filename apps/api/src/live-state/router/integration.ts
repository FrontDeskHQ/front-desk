import { ulid } from "ulid";
import { z } from "zod";
import { authorize, requireInternalApiKey } from "../../lib/authorize";
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

export default privateRoute.withProcedures(({ mutation, query }) => ({
    // --- Reads ---------------------------------------------------------------
    // Replaces the removed default-query path. Auth is per-handler now: internal
    // bot keys read freely; sessions are scoped to their org membership via
    // `authorize`. In-app reads still flow through the org-tree load procedure.

    /**
     * Single integration by id — internal (bot) use only, so it can't be used
     * to probe whether an arbitrary integration id exists. In-app reads flow
     * through the org tree; web redirect handlers use `forOrg`.
     */
    byId: query(z.object({ id: z.string() })).handler(async ({ req, db }) => {
      requireInternalApiKey(req.context);
      return db.integration.one(req.input.id).get();
    }),

    /** Single integration for an org, optionally filtered by type/enabled. */
    forOrg: query(
      z.object({
        organizationId: z.string(),
        type: z.string().optional(),
        enabled: z.boolean().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const { organizationId, type, enabled } = req.input;
      authorize(req, { organizationId });
      return Object.values(
        await db.find(schema.integration, {
          where: {
            organizationId,
            ...(type !== undefined ? { type } : {}),
            ...(enabled !== undefined ? { enabled } : {}),
          },
        }),
      )[0];
    }),

    /** All integrations of a given type across orgs — internal (bot) use only. */
    listByType: query(z.object({ type: z.string() })).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);
        return Object.values(
          await db.find(schema.integration, {
            where: { type: req.input.type },
          }),
        );
      },
    ),

    // --- Mutations -----------------------------------------------------------
    connectInstallation: mutation(connectInstallationInputSchema).handler(
      async ({ req, db }) => {
        const { organizationId, type, enabled, configStr, id, createdAt, updatedAt } =
          req.input;

        authorize(req, { organizationId, role: "owner" });

        const now = new Date();

        return db.transaction(async ({ trx }) => {
          const existing = Object.values(
            await trx.find(schema.integration, {
              where: { organizationId, type },
            }),
          )[0];

          if (existing) {
            return trx.update(schema.integration, existing.id, {
              ...(enabled !== undefined ? { enabled } : {}),
              ...(configStr !== undefined ? { configStr } : {}),
              updatedAt: updatedAt ?? now,
            });
          }

          return trx.insert(schema.integration, {
            id: id ?? ulid().toLowerCase(),
            organizationId,
            type,
            enabled: enabled ?? false,
            configStr: configStr ?? null,
            createdAt: createdAt ?? now,
            updatedAt: updatedAt ?? now,
          });
        });
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

      let config: { teamId?: unknown };
      try {
        config = JSON.parse(integration.configStr);
      } catch {
        throw new Error("SLACK_INTEGRATION_CONFIG_INVALID");
      }
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
