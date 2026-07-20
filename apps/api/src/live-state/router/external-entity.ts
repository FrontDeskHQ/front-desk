// TODO refactor with new live-state mental model
import type { PrIndexJobData } from "@workspace/schemas/signals";
import { ulid } from "ulid";
import { z } from "zod";
import { authorize, requireInternalApiKey } from "../../lib/authorize";
import { enqueueGithubBackfill, enqueuePrIndex } from "../../lib/queue";
import { privateRoute } from "../factories";
import { schema } from "../schema";

/**
 * Org-scoped mirror of external issues/PRs.
 *
 * Default insert/update mutators are intentionally disabled: the mirror is only
 * ever written through the custom `upsert` / `softDelete` procedures below,
 * which own the `(organizationId, externalKey)` identity and the
 * `lastSyncedAt` / `deletedAt` bookkeeping. Org members read their own org's
 * entities; only the integration (internal API key) writes.
 */

const githubBackfillConfigSchema = z.object({
  installationId: z.number().int().positive().optional(),
  repos: z
    .array(
      z.object({
        owner: z.string().min(1),
        name: z.string().min(1),
        fullName: z.string().min(1),
      }),
    )
    .default([]),
});

const externalEntityFields = z.object({
  organizationId: z.string(),
  provider: z.string(),
  externalKey: z.string(),
  type: z.enum(["issue", "pull_request"]),
  number: z.number(),
  repoFullName: z.string(),
  url: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  authorLogin: z.string().nullable(),
  assignees: z.array(z.string()),
  labels: z.array(z.string()),
  externalCreatedAt: z.coerce.date(),
  externalUpdatedAt: z.coerce.date(),
  closedAt: z.coerce.date().nullable(),
  merged: z.boolean().nullable(),
  mergedAt: z.coerce.date().nullable(),
  draft: z.boolean().nullable(),
  headRef: z.string().nullable(),
  baseRef: z.string().nullable(),
});

export default privateRoute.withProcedures(({ mutation, query }) => ({
    /**
     * Non-deleted mirror rows for a repo — the reconcile job's cursor/baseline.
     * Internal (integration) use only; in-app reads flow through the org tree.
     */
    listForRepo: query(
      z.object({
        organizationId: z.string(),
        repoFullName: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      requireInternalApiKey(req.context);
      return Object.values(
        await db.find(schema.externalEntity, {
          where: {
            organizationId: req.input.organizationId,
            repoFullName: req.input.repoFullName,
            provider: "github",
            deletedAt: null,
          },
        }),
      );
    }),

    /**
     * Insert or update the mirror row identified by
     * `(organizationId, externalKey)`. Refreshes `lastSyncedAt` and clears any
     * previous `deletedAt` (a live event means the entity exists again).
     *
     * The find-then-insert/update runs inside a transaction so concurrent
     * events for the same entity don't race into duplicate rows.
     */
    upsert: mutation(externalEntityFields).handler(async ({ req, db }) => {
      requireInternalApiKey(req.context);

      const { organizationId, externalKey } = req.input;
      const now = new Date();

      const id = await db.transaction(async ({ trx }) => {
        const existing = Object.values(
          await trx.find(schema.externalEntity, {
            where: { organizationId, externalKey },
          }),
        )[0];

        if (existing) {
          await trx.update(schema.externalEntity, existing.id, {
            ...req.input,
            lastSyncedAt: now,
            deletedAt: null,
          });
          return existing.id;
        }

        const newId = ulid().toLowerCase();
        await trx.insert(schema.externalEntity, {
          id: newId,
          ...req.input,
          lastSyncedAt: now,
          deletedAt: null,
        });
        return newId;
      });

      // Keep the PR vector index current on every mirror write (webhook,
      // backfill, reconcile). Index-only: the worker derives eligibility and
      // re-embeds; it never fans out `pr_matched` reads (FRO-203). Fire-and-log
      // so an indexing hiccup never fails the mirror write.
      if (req.input.type === "pull_request") {
        const jobData: PrIndexJobData = {
          organizationId,
          externalEntityId: id,
          externalKey,
          provider: req.input.provider,
          repoFullName: req.input.repoFullName,
          number: req.input.number,
          url: req.input.url,
          title: req.input.title,
          body: req.input.body,
          headRef: req.input.headRef,
          state: req.input.state,
          draft: req.input.draft,
        };
        enqueuePrIndex(jobData).catch((error) => {
          console.error(`Failed to enqueue PR index for ${externalKey}:`, error);
        });
      }

      return id;
    }),

    /**
     * Soft-delete the mirror row (issue deletion / transfer-out). No-op when the
     * entity was never mirrored.
     */
    softDelete: mutation(
      z.object({
        organizationId: z.string(),
        externalKey: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      requireInternalApiKey(req.context);

      const { organizationId, externalKey } = req.input;

      const deleted = await db.transaction(async ({ trx }) => {
        const existing = Object.values(
          await trx.find(schema.externalEntity, {
            where: { organizationId, externalKey },
          }),
        )[0];

        if (!existing) return null;

        const now = new Date();
        await trx.update(schema.externalEntity, existing.id, {
          deletedAt: now,
          lastSyncedAt: now,
        });
        return { id: existing.id, type: existing.type };
      });

      // Drop the PR vector when its mirror row is removed (PR deleted /
      // transferred out) so stale points can't surface in similarity search.
      if (deleted && deleted.type === "pull_request") {
        const jobData: PrIndexJobData = {
          organizationId,
          externalEntityId: deleted.id,
          externalKey,
          deleted: true,
        };
        enqueuePrIndex(jobData).catch((error) => {
          console.error(
            `Failed to enqueue PR index delete for ${externalKey}:`,
            error,
          );
        });
      }

      return deleted?.id ?? null;
    }),

    /**
     * Dev-only manual sync: enqueue a full issue/PR backfill for each connected
     * repo, populating the mirror without webhooks (which aren't wired up
     * locally). The github app owns the backfill worker that processes the jobs;
     * this just kicks them off. Refuses to run in production, where webhooks +
     * the daily reconcile keep the mirror current.
     */
    syncFromGithub: mutation(
      z.object({
        organizationId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("DEV_ONLY");
      }

      const { organizationId } = req.input;

      authorize(req, { organizationId });

      const integration = Object.values(
        await db.find(schema.integration, {
          where: { organizationId, type: "github", enabled: true },
        }),
      )[0];
      if (!integration || !integration.configStr) {
        throw new Error("GITHUB_INTEGRATION_NOT_CONFIGURED");
      }

      let rawConfig: unknown;
      try {
        rawConfig = JSON.parse(integration.configStr);
      } catch {
        throw new Error("GITHUB_INTEGRATION_NOT_CONFIGURED");
      }
      const parsedConfig = githubBackfillConfigSchema.safeParse(rawConfig);
      if (!parsedConfig.success) {
        throw new Error("GITHUB_INTEGRATION_NOT_CONFIGURED");
      }
      const { repos, installationId } = parsedConfig.data;
      if (repos.length === 0) {
        throw new Error("GITHUB_REPOSITORIES_NOT_CONFIGURED");
      }
      if (!installationId) {
        throw new Error("GITHUB_INSTALLATION_NOT_CONFIGURED");
      }

      const results = await Promise.allSettled(
        repos.map((repo) =>
          enqueueGithubBackfill({
            organizationId,
            installationId,
            owner: repo.owner,
            repo: repo.name,
            fullName: repo.fullName,
          }),
        ),
      );

      const enqueued = results.filter(
        (result): result is PromiseFulfilledResult<string> =>
          result.status === "fulfilled" && result.value !== null,
      ).length;

      return { enqueued, repos: repos.length };
    }),
  }));
