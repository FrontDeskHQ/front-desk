import { probeConnection } from "@connectors/framework";
import { ulid } from "ulid";
import { z } from "zod";

import { authorize, requireInternalApiKey } from "../../lib/authorize";
import {
  connectorInvokeSecret,
  connectorRegistry,
} from "../../lib/connector-registry";
import { enqueueGithubBackfill } from "../../lib/queue";
import { privateRoute } from "../factories";
import { schema } from "../schema";
import { slackChannelsCache } from "./slack-channels";

const connectInstallationInputSchema = z.object({
  configStr: z.string().nullable().optional(),
  createdAt: z.coerce.date().optional(),
  enabled: z.boolean().optional(),
  id: z.string().optional(),
  organizationId: z.string(),
  type: z.string(),
  updatedAt: z.coerce.date().optional(),
});

const updateInstallationInputSchema = z
  .object({
    configStr: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
    integrationId: z.string(),
    updatedAt: z.coerce.date().optional(),
  })
  .refine(
    (input) => {
      const { integrationId: _integrationId, ...fields } = input;
      return Object.values(fields).some((value) => value !== undefined);
    },
    { message: "NO_FIELDS_TO_UPDATE" }
  );

const reenableInputSchema = z.object({
  integrationId: z.string(),
});

const githubBackfillConfigSchema = z.object({
  installationId: z.number().int().positive().optional(),
  repos: z
    .array(
      z
        .object({
          fullName: z.string().min(1),
          name: z.string().regex(/^[^/]+$/),
          owner: z.string().regex(/^[^/]+$/),
        })
        // `fullName` keys the job id while `owner`/`name` address the API
        // target, so a mismatch would dedupe against the wrong repo.
        .refine(({ fullName, name, owner }) => fullName === `${owner}/${name}`, {
          message: "fullName must match owner/name",
        })
    )
    .default([]),
});

/**
 * Replay each connected repo's issue/PR history after a silent re-enable.
 *
 * Webhook handlers don't gate on `integration.enabled`, so a plain
 * disable → enable cycle usually leaves the mirror current already. This is the
 * safety net for the cases where it isn't: deliveries dropped while the
 * connector was down, a suspended install, or a long disabled stretch. The
 * backfill processor is idempotent (upsert-by-`externalKey`), so a redundant
 * run only refreshes rows.
 *
 * Fire-and-log: `enabled` is already persisted by the time this runs, so a
 * transient Redis outage must not fail the re-enable.
 */
const enqueueGithubReenableBackfill = async (
  organizationId: string,
  configStr: string | null
): Promise<void> => {
  if (!configStr) {
    return;
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(configStr);
  } catch {
    return;
  }

  const parsed = githubBackfillConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    return;
  }

  const { installationId, repos } = parsed.data;
  if (!installationId || repos.length === 0) {
    return;
  }

  const results = await Promise.allSettled(
    repos.map((repo) =>
      enqueueGithubBackfill({
        fullName: repo.fullName,
        installationId,
        organizationId,
        owner: repo.owner,
        repo: repo.name,
      })
    )
  );

  for (const [index, result] of results.entries()) {
    // A `null` value means the queue wasn't available, so the backfill was
    // dropped just as surely as a rejection — both need to show up in logs.
    if (result.status === "rejected" || result.value === null) {
      console.error(
        `[Integration] Failed to enqueue GitHub backfill for ${repos[index]?.fullName} on re-enable:`,
        result.status === "rejected"
          ? result.reason
          : "GitHub backfill queue is unavailable"
      );
    }
  }
};

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
      enabled: z.boolean().optional(),
      organizationId: z.string(),
      type: z.string().optional(),
    })
  ).handler(async ({ req, db }) => {
    const { organizationId, type, enabled } = req.input;
    authorize(req, { organizationId });
    return Object.values(
      await db.find(schema.integration, {
        where: {
          organizationId,
          ...(type === undefined ? {} : { type }),
          ...(enabled === undefined ? {} : { enabled }),
        },
      })
    )[0];
  }),

  /** All integrations of a given type across orgs — internal (bot) use only. */
  listByType: query(z.object({ type: z.string() })).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);
      return Object.values(
        await db.find(schema.integration, {
          where: { type: req.input.type },
        })
      );
    }
  ),

  // --- Mutations -----------------------------------------------------------
  connectInstallation: mutation(connectInstallationInputSchema).handler(
    async ({ req, db }) => {
      const {
        organizationId,
        type,
        enabled,
        configStr,
        id,
        createdAt,
        updatedAt,
      } = req.input;

      authorize(req, { organizationId, role: "owner" });

      const now = new Date();

      return db.transaction(async ({ trx }) => {
        const existing = Object.values(
          await trx.find(schema.integration, {
            where: { organizationId, type },
          })
        )[0];

        if (existing) {
          return trx.update(schema.integration, existing.id, {
            ...(enabled === undefined ? {} : { enabled }),
            ...(configStr === undefined ? {} : { configStr }),
            updatedAt: updatedAt ?? now,
          });
        }

        return trx.insert(schema.integration, {
          configStr: configStr ?? null,
          createdAt: createdAt ?? now,
          enabled: enabled ?? false,
          id: id ?? ulid().toLowerCase(),
          organizationId,
          type,
          updatedAt: updatedAt ?? now,
        });
      });
    }
  ),

  updateInstallation: mutation(updateInstallationInputSchema).handler(
    async ({ req, db }) => {
      const integration = await db.integration
        .one(req.input.integrationId)
        .get();
      if (!integration) {
        throw new Error("INTEGRATION_NOT_FOUND");
      }

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
    }
  ),

  /**
   * Re-enable a disabled integration after checking external install liveness
   * (ADR-0010). Opt-in per connector manifest (`supportsConnectionProbe`):
   * - `live: true` → set `enabled: true` (no metadata refresh) and, for github,
   *   enqueue a catch-up backfill per connected repo
   * - `live: false` → write suggested sanitized `configStr` (when present) and
   *   return `needs_connect`
   * - transport/unknown failure → throw (fail soft: no enable, no clear)
   * - connector has not opted in → `needs_connect` (never silent-enable)
   */
  reenable: mutation(reenableInputSchema).handler(async ({ req, db }) => {
    const integration = await db.integration.one(req.input.integrationId).get();
    if (!integration) {
      throw new Error("INTEGRATION_NOT_FOUND");
    }

    authorize(req, {
      organizationId: integration.organizationId,
      role: "owner",
    });

    const entry = connectorRegistry.getByType(integration.type);
    if (!entry?.manifest.supportsConnectionProbe) {
      return { outcome: "needs_connect" as const };
    }

    const probedConfigStr = integration.configStr;
    const probeResult = await probeConnection(
      entry.probeUrl,
      { config: probedConfigStr },
      { secret: connectorInvokeSecret }
    );

    // Probe is a network round-trip — reconnect/setup or uninstall clearing may
    // have rewritten config (or flipped enabled) while we were waiting. Do not
    // apply a stale probe result over a newer install identity.
    const current = await db.integration.one(integration.id).get();
    if (!current) {
      throw new Error("INTEGRATION_NOT_FOUND");
    }
    if (current.configStr !== probedConfigStr) {
      return {
        outcome: current.enabled
          ? ("enabled" as const)
          : ("needs_connect" as const),
      };
    }
    if (current.enabled) {
      return { outcome: "enabled" as const };
    }

    const now = new Date();

    if (probeResult.live) {
      await db.update(schema.integration, integration.id, {
        enabled: true,
        updatedAt: now,
      });

      // Type-gated: backfill-on-reenable is github's own catch-up path. Other
      // connectors re-enable without one (discord backfills off its own
      // integration-change subscription).
      if (integration.type === "github") {
        await enqueueGithubReenableBackfill(
          integration.organizationId,
          current.configStr
        );
      }

      return { outcome: "enabled" as const };
    }

    await db.update(schema.integration, integration.id, {
      ...(probeResult.configStr === undefined
        ? {}
        : { configStr: probeResult.configStr }),
      updatedAt: now,
    });
    return { outcome: "needs_connect" as const };
  }),

  fetchSlackChannels: mutation(
    z.object({
      organizationId: z.string(),
      teamId: z.string().optional(),
    })
  ).handler(async ({ req, db }) => {
    const { organizationId, teamId: requestedTeamId } = req.input;

    authorize(req, { organizationId, role: "owner" });

    const integration = Object.values(
      await db.find(schema.integration, {
        where: {
          enabled: true,
          organizationId,
          type: "slack",
        },
      })
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
