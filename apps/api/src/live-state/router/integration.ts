import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  encodeAuthorizationState,
  probeConnection,
  RemoteInvokeTimeoutError,
  requestAuthorizationUrl,
  revokeAuthorization,
} from "@connectors/framework";
import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";
import type { IssueIndexJobData } from "@workspace/schemas/signals";
import { ulid } from "ulid";
import { z } from "zod";

import { authorize, requireInternalApiKey } from "../../lib/authorize";
import {
  connectorRegistry,
  getConnectorInvokeSecret,
} from "../../lib/connector-registry";
import { errors } from "../../lib/errors";
import {
  clearIntegrationCredential,
  lockOwnedIntegration,
  readIntegrationCredential,
  writeIntegrationCredential,
  writeIntegrationCredentialInTransaction,
} from "../../lib/integration-credential";
import {
  enqueueGithubBackfill,
  enqueueIssueIndex,
  enqueueThreadImport,
} from "../../lib/queue";
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

const integrationIdInputSchema = z.object({
  integrationId: z.string().min(1),
});

/** Opaque to core: only the connector interprets its credential. */
const credentialValueSchema = z
  .unknown()
  .refine((value) => value !== undefined && value !== null, {
    message: "CREDENTIAL_REQUIRED",
  });

/** Support connectors that implement "Import threads". */
const THREAD_IMPORT_PROVIDERS = new Set(["discord", "slack"]);

const AUTHORIZATION_STATE_TTL_MS = 10 * 60_000;

const hashAuthorizationState = (state: string): string =>
  createHash("sha256").update(state).digest("hex");

const secretsMatch = (provided: string, expected: string): boolean => {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
};

const requireAuthorizationConnector = (type: string) => {
  const entry = connectorRegistry.getByType(type);
  if (!entry?.manifest.supportsAuthorization) {
    throw errors.badRequest(
      "AUTHORIZATION_NOT_SUPPORTED",
      "This integration doesn't support authorization."
    );
  }
  return entry;
};

type IntegrationRow = InferLiveObject<typeof schema.integration>;

const finalizeDisconnect = async (
  db: ServerDB<typeof schema>,
  integration: IntegrationRow
): Promise<void> => {
  const deletedEntities = await db.transaction(async ({ trx }) => {
    const entities = Object.values(
      await trx.find(schema.externalEntity, {
        where: {
          deletedAt: null,
          integrationId: integration.id,
          organizationId: integration.organizationId,
        },
      })
    );
    const now = new Date();

    await trx.update(schema.integration, integration.id, {
      enabled: false,
      updatedAt: now,
    });
    for (const entity of entities) {
      await trx.update(schema.externalEntity, entity.id, {
        deletedAt: now,
        lastSyncedAt: now,
      });
    }
    await clearIntegrationCredential(trx, {
      integrationId: integration.id,
      organizationId: integration.organizationId,
    });
    return entities;
  });

  for (const entity of deletedEntities) {
    if (entity.type !== "issue") continue;
    const jobData: IssueIndexJobData = {
      deleted: true,
      externalEntityId: entity.id,
      externalKey: entity.externalKey,
      organizationId: integration.organizationId,
    };
    enqueueIssueIndex(jobData).catch((error) => {
      console.error(
        `Failed to enqueue issue index delete for ${entity.externalKey}:`,
        error
      );
    });
  }
};

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
        .refine(
          ({ fullName, name, owner }) => fullName === `${owner}/${name}`,
          {
            message: "fullName must match owner/name",
          }
        )
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
        throw errors.notFound("integration");
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
      throw errors.notFound("integration");
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
      { config: probedConfigStr, integrationId: integration.id },
      { secret: getConnectorInvokeSecret() }
    ).catch((error: unknown) => {
      throw error instanceof RemoteInvokeTimeoutError
        ? errors.gatewayTimeout(
            "CONNECTION_PROBE_TIMEOUT",
            "The integration took too long to respond. Try again in a moment.",
            { cause: error }
          )
        : errors.badGateway(
            "CONNECTION_PROBE_FAILED",
            "Couldn't check the integration's connection. Try again in a moment.",
            { cause: error }
          );
    });

    // Probe is a network round-trip — reconnect/setup or uninstall clearing may
    // have rewritten config (or flipped enabled) while we were waiting. Do not
    // apply a stale probe result over a newer install identity.
    const current = await db.integration.one(integration.id).get();
    if (!current) {
      throw errors.notFound("integration");
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

      // Type-gated: backfill-on-reenable is github's own catch-up path. Support
      // connectors import history only when the owner asks ("Import threads").
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

  // --- Authorization (ADR-0024) -------------------------------------------
  // Core keeps the handshake state and custody of the credential; the
  // connector alone knows what the credential contains.

  /** Start an owner's authorization handshake; returns the URL to visit. */
  beginAuthorization: mutation(integrationIdInputSchema).handler(
    async ({ req, db }) => {
      const integration = await db.integration
        .one(req.input.integrationId)
        .get();
      if (!integration) {
        throw errors.notFound("integration");
      }
      authorize(req, {
        organizationId: integration.organizationId,
        role: "owner",
      });
      const entry = requireAuthorizationConnector(integration.type);

      const nonce = randomBytes(32).toString("hex");
      const now = new Date();
      await db.transaction(async ({ trx }) => {
        await lockOwnedIntegration(
          trx,
          integration.organizationId,
          integration.id
        );
        const existing = (
          await trx.integrationOAuthState
            .where({ integrationId: integration.id })
            .get()
        )[0];
        const fields = {
          consumedAt: null,
          createdAt: now,
          expiresAt: new Date(now.getTime() + AUTHORIZATION_STATE_TTL_MS),
          organizationId: integration.organizationId,
          stateHash: hashAuthorizationState(nonce),
        };
        if (existing) {
          await trx.integrationOAuthState.update(existing.id, fields);
          return;
        }
        await trx.integrationOAuthState.insert({
          ...fields,
          id: ulid().toLowerCase(),
          integrationId: integration.id,
        });
      });

      return requestAuthorizationUrl(
        entry.authorizationUrl,
        {
          config: integration.configStr,
          integrationId: integration.id,
          state: encodeAuthorizationState(
            integration.type,
            integration.id,
            nonce
          ),
        },
        { secret: getConnectorInvokeSecret() }
      );
    }
  ),

  /**
   * Finish a handshake on behalf of the connector host: verify and consume the
   * state, store the opaque credential, merge the connector's config patch
   * (`null` deletes a key) and enable the integration.
   */
  completeAuthorization: mutation(
    z.object({
      connectorType: z.string().min(1),
      configPatch: z.record(z.string(), z.unknown()),
      credential: credentialValueSchema,
      expectedConfig: z.string().nullable(),
      integrationId: z.string().min(1),
      state: z.string().min(1),
    })
  ).handler(async ({ req, db }) => {
    requireInternalApiKey(req.context);
    await db.transaction(async ({ trx }) => {
      const initial = await trx.integration.one(req.input.integrationId).get();
      if (!initial) {
        throw errors.notFound("integration");
      }
      requireAuthorizationConnector(initial.type);
      await lockOwnedIntegration(trx, initial.organizationId, initial.id);
      const integration = await trx.integration.one(initial.id).get();
      if (!integration) {
        throw errors.notFound("integration");
      }
      if (integration.type !== req.input.connectorType) {
        throw new Error("AUTHORIZATION_CONNECTOR_TYPE_MISMATCH");
      }
      if (integration.configStr !== req.input.expectedConfig) {
        throw new Error("AUTHORIZATION_CONFIG_CHANGED");
      }

      const pendingState = (
        await trx.integrationOAuthState
          .where({ integrationId: integration.id })
          .get()
      )[0];
      if (
        !pendingState ||
        pendingState.consumedAt ||
        pendingState.expiresAt.getTime() <= Date.now() ||
        !secretsMatch(
          hashAuthorizationState(req.input.state),
          pendingState.stateHash
        )
      ) {
        throw new Error("AUTHORIZATION_STATE_MISMATCH");
      }

      let currentConfig: Record<string, unknown>;
      try {
        currentConfig = z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(integration.configStr ?? "{}"));
      } catch {
        throw new Error("INVALID_INTEGRATION_CONFIG");
      }
      const config = Object.fromEntries(
        Object.entries({ ...currentConfig, ...req.input.configPatch }).filter(
          ([, value]) => value !== null
        )
      );

      await writeIntegrationCredentialInTransaction(trx, {
        integrationId: integration.id,
        organizationId: integration.organizationId,
        value: req.input.credential,
      });
      const now = new Date();
      await trx.integration.update(integration.id, {
        configStr: JSON.stringify(config),
        enabled: true,
        updatedAt: now,
      });
      await trx.integrationOAuthState.update(pendingState.id, {
        consumedAt: now,
      });
    });
    return { ok: true };
  }),

  /** Connector-host read of the stored credential; `null` when none is live. */
  readCredential: mutation(integrationIdInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);
      const integration = await db.integration
        .one(req.input.integrationId)
        .get();
      if (!integration) {
        throw errors.notFound("integration");
      }
      const stored = await readIntegrationCredential(db, {
        integrationId: integration.id,
        organizationId: integration.organizationId,
      });
      return stored
        ? {
            credential: stored.value,
            organizationId: integration.organizationId,
            version: stored.version,
          }
        : null;
    }
  ),

  /**
   * Connector-host rotation of the stored credential. Compare-and-swap on
   * `expectedVersion`; a conflict returns `ok: false` so the caller re-reads.
   */
  writeCredential: mutation(
    z.object({
      credential: credentialValueSchema,
      expectedVersion: z.number().int().nonnegative(),
      integrationId: z.string().min(1),
    })
  ).handler(async ({ req, db }) => {
    requireInternalApiKey(req.context);
    const integration = await db.integration.one(req.input.integrationId).get();
    if (!integration) {
      throw errors.notFound("integration");
    }
    return writeIntegrationCredential(db, {
      expectedVersion: req.input.expectedVersion,
      integrationId: integration.id,
      organizationId: integration.organizationId,
      value: req.input.credential,
    });
  }),

  /** Revoke the authorization upstream, then tear the integration down. */
  disconnect: mutation(integrationIdInputSchema).handler(
    async ({ req, db }) => {
      const integration = await db.integration
        .one(req.input.integrationId)
        .get();
      if (!integration) {
        throw errors.notFound("integration");
      }
      authorize(req, {
        organizationId: integration.organizationId,
        role: "owner",
      });
      const entry = requireAuthorizationConnector(integration.type);

      await revokeAuthorization(
        entry.authorizationRevokeUrl,
        { config: integration.configStr, integrationId: integration.id },
        { secret: getConnectorInvokeSecret() }
      );

      // Revocation is a network round-trip. A reconnect can replace the
      // credential and config while it is in flight; never finalize cleanup
      // against that newer integration snapshot.
      const current = await db.integration.one(integration.id).get();
      if (!current) {
        throw errors.notFound("integration");
      }
      if (
        current.configStr !== integration.configStr ||
        current.updatedAt.getTime() !== integration.updatedAt.getTime()
      ) {
        return { ok: true };
      }
      await finalizeDisconnect(db, current);
      return { ok: true };
    }
  ),

  /**
   * "Import threads": start importing the newest eligible history from the
   * integration's selected support channels, up to the organization's
   * allowance. Owner-triggered only; selecting channels never imports.
   */
  importThreads: mutation(integrationIdInputSchema).handler(
    async ({ req, db }) => {
      const integration = await db.integration
        .one(req.input.integrationId)
        .get();
      if (!integration) {
        throw errors.notFound("integration");
      }
      authorize(req, {
        organizationId: integration.organizationId,
        role: "owner",
      });
      if (!THREAD_IMPORT_PROVIDERS.has(integration.type)) {
        throw errors.badRequest(
          "THREAD_IMPORT_NOT_SUPPORTED",
          "This integration can't import threads."
        );
      }
      if (!integration.enabled) {
        throw errors.badRequest(
          "INTEGRATION_DISABLED",
          "Reconnect the integration before importing threads."
        );
      }

      // The connector owns `threadImport` from its first report, so this
      // handler never writes it and can't overwrite a live run's progress.
      const unavailable = (cause?: unknown) =>
        errors.serviceUnavailable(
          "THREAD_IMPORT_UNAVAILABLE",
          "Importing threads is unavailable right now. Try again in a moment.",
          cause === undefined ? undefined : { cause }
        );
      const outcome = await enqueueThreadImport(integration.type, {
        integrationId: integration.id,
      }).catch((cause: unknown) => {
        throw unavailable(cause);
      });
      if (outcome === "queue_unavailable") {
        throw unavailable();
      }
      return { outcome };
    }
  ),

  /** Connector-host report that the external system revoked access. */
  markRevoked: mutation(integrationIdInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);
      const integration = await db.integration
        .one(req.input.integrationId)
        .get();
      if (!integration) {
        throw errors.notFound("integration");
      }
      requireAuthorizationConnector(integration.type);
      await finalizeDisconnect(db, integration);
      return { ok: true };
    }
  ),

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
      throw errors.preconditionFailed(
        "SLACK_INTEGRATION_NOT_CONFIGURED",
        "The Slack integration isn't configured"
      );
    }

    let config: { teamId?: unknown };
    try {
      config = JSON.parse(integration.configStr);
    } catch {
      throw errors.preconditionFailed(
        "SLACK_INTEGRATION_CONFIG_INVALID",
        "The Slack integration configuration is invalid. Reconnect Slack."
      );
    }
    const teamId = config?.teamId;

    if (!teamId) {
      throw errors.preconditionFailed(
        "SLACK_TEAM_ID_NOT_FOUND",
        "The Slack integration has no workspace. Reconnect Slack."
      );
    }

    if (
      requestedTeamId !== undefined &&
      String(teamId) !== String(requestedTeamId)
    ) {
      throw errors.badRequest(
        "SLACK_TEAM_MISMATCH",
        "That channel belongs to a different Slack workspace"
      );
    }

    return slackChannelsCache.get({
      organizationId,
      teamId: String(teamId),
    });
  }),
}));
