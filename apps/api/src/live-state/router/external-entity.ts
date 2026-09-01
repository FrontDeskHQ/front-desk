// TODO refactor with new live-state mental model
import type {
  IssueIndexJobData,
  PrIndexJobData,
} from "@workspace/schemas/signals";
import {
  invokeCapability,
  trackerReadOutcomeResultSchema,
} from "@connectors/framework";
import { ulid } from "ulid";
import { z } from "zod";

import { authorize, requireInternalApiKey } from "../../lib/authorize";
import {
  buildEntityRef,
  resolveEntityCapabilityTarget,
} from "../../lib/capability-dispatch";
import { connectorInvokeSecret } from "../../lib/connector-registry";
import {
  didExternalEntityFinish,
  fanOutEntityFinished,
} from "../../lib/entity-finished";
import {
  enqueueGithubBackfill,
  enqueueIssueIndex,
  enqueuePrIndex,
  enqueueThreadRead,
} from "../../lib/queue";
import { privateRoute } from "../factories";
import { schema } from "../schema";

/** Thread statuses a push-side PR match may light up: Open (0), In progress (1). */
const PR_MATCH_ACTIVE_STATUSES = new Set([0, 1]);

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
        fullName: z.string().min(1),
        name: z.string().min(1),
        owner: z.string().min(1),
      })
    )
    .default([]),
});

const externalEntityFields = z.object({
  assignees: z.array(z.string()),
  authorLogin: z.string().nullable(),
  baseRef: z.string().nullable(),
  body: z.string().nullable(),
  closedAt: z.coerce.date().nullable(),
  draft: z.boolean().nullable(),
  externalCreatedAt: z.coerce.date(),
  externalKey: z.string(),
  externalUpdatedAt: z.coerce.date(),
  headRef: z.string().nullable(),
  labels: z.array(z.string()),
  merged: z.boolean().nullable(),
  mergedAt: z.coerce.date().nullable(),
  number: z.number(),
  organizationId: z.string(),
  provider: z.string(),
  repoFullName: z.string(),
  state: z.string(),
  title: z.string(),
  type: z.enum(["issue", "pull_request"]),
  url: z.string(),
});

export default privateRoute.withProcedures(({ mutation, query }) => ({
  /**
   * Fan out `pr_matched` thread reads for a push-side PR match (FRO-205). The
   * worker's `match-pr` job passes the similar-thread candidates it found in
   * the vector index; this resolves the PR from the mirror, filters the
   * candidates to *unlinked* Open / In-progress threads (the DB is the source
   * of truth — a vector payload's status can lag), and enqueues one
   * `pr_matched` read per survivor. Synthesis decides whether to emit
   * `link_pr` (ADR 0006). Internal (worker) use only.
   */
  fanOutPrMatch: mutation(
    z.object({
      organizationId: z.string(),
      externalKey: z.string(),
      matches: z.array(
        z.object({ threadId: z.string(), score: z.number().min(0).max(1) })
      ),
    })
  ).handler(async ({ req, db }) => {
    requireInternalApiKey(req.context);

    const { organizationId, externalKey, matches } = req.input;
    const dispositions = {
      buffered: 0,
      coalesced: 0,
      scheduled: 0,
      skipped: 0,
    };
    let unavailable = 0;
    if (matches.length === 0) {
      return { dispositions, enqueued: 0, unavailable };
    }

    // A candidate can be repeated when retrieval or reranking is composed from
    // multiple sources. Keep one score per thread before the authoritative DB
    // filter and fan-out so one PR cannot enqueue the same thread twice.
    const uniqueMatches = [
      ...matches.reduce((byThread, match) => {
        const previous = byThread.get(match.threadId);
        if (!previous || match.score > previous.score) {
          byThread.set(match.threadId, match);
        }
        return byThread;
      }, new Map<string, (typeof matches)[number]>()),
    ].map(([, match]) => match);

    const pr = Object.values(
      await db.find(schema.externalEntity, {
        where: {
          organizationId,
          externalKey,
          type: "pull_request",
          deletedAt: null,
        },
      })
    )[0];
    // Authoritative eligibility gate: the mirror is the source of truth, so a
    // PR that went gone (closed-and-deleted / transferred out) or flipped to
    // closed / draft since the match ran is dropped rather than fanned out.
    if (!pr || pr.state !== "open" || pr.draft === true) {
      return { dispositions, enqueued: 0, unavailable };
    }

    const threads = new Map(
      Object.values(
        await db.find(schema.thread, {
          where: {
            id: { $in: uniqueMatches.map((m) => m.threadId) },
            organizationId,
          },
        })
      ).map((thread) => [thread.id, thread])
    );

    for (const { threadId, score } of uniqueMatches) {
      const thread = threads.get(threadId);
      // Skip threads that are gone, archived, closed/resolved, or already
      // PR-linked.
      if (
        !thread ||
        thread.deletedAt !== null ||
        !PR_MATCH_ACTIVE_STATUSES.has(thread.status) ||
        thread.externalPrId
      ) {
        continue;
      }

      const result = await enqueueThreadRead(threadId, {
        kind: "pr_matched",
        organizationId,
        prMatched: {
          prId: pr.id,
          url: pr.url,
          title: pr.title,
          score,
        },
      });
      if (
        result.reason === "queue_unavailable" &&
        result.disposition !== "buffered"
      ) {
        unavailable += 1;
      } else {
        dispositions[result.disposition] += 1;
      }
    }

    return {
      dispositions,
      enqueued:
        dispositions.scheduled + dispositions.coalesced + dispositions.buffered,
      unavailable,
    };
  }),

  /**
   * Non-deleted mirror rows for a repo — the reconcile job's cursor/baseline.
   * Internal (integration) use only; in-app reads flow through the org tree.
   */
  listForRepo: query(
    z.object({
      organizationId: z.string(),
      repoFullName: z.string(),
    })
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
      })
    );
  }),

  /**
   * A single non-deleted mirrored pull request by canonical URL — the
   * synthesis `read_pr` tool's depth-verification lookup (FRO-204). Keyed by
   * URL to mirror the link-PR handler, which routes by the same canonical URL
   * the `link_pr` action carries. Internal (worker) use only.
   */
  prByUrl: query(
    z.object({
      organizationId: z.string(),
      url: z.string(),
    })
  ).handler(async ({ req, db }) => {
    requireInternalApiKey(req.context);
    return (
      Object.values(
        await db.find(schema.externalEntity, {
          where: {
            organizationId: req.input.organizationId,
            url: req.input.url,
            type: "pull_request",
            deletedAt: null,
          },
        })
      )[0] ?? null
    );
  }),

  /**
   * A single non-deleted mirrored issue by canonical URL — the synthesis
   * `read_issue` tool's depth-verification lookup, and the same key
   * `link_issue` routes by. Internal (worker) use only.
   */
  issueByUrl: query(
    z.object({
      organizationId: z.string(),
      url: z.string(),
    })
  ).handler(async ({ req, db }) => {
    requireInternalApiKey(req.context);
    return (
      Object.values(
        await db.find(schema.externalEntity, {
          where: {
            organizationId: req.input.organizationId,
            url: req.input.url,
            type: "issue",
            deletedAt: null,
          },
        })
      )[0] ?? null
    );
  }),

  /**
   * Read the provider's current structural outcome for synthesis. This is a
   * narrow capability read: current fields and duplicate successor, never
   * comments. Transient connector failures retry locally, then degrade to an
   * explicit unavailable result so the Agent can only suggest.
   */
  readOutcome: query(
    z.object({
      externalKey: z.string().min(1),
      organizationId: z.string(),
    })
  ).handler(async ({ req, db }) => {
    requireInternalApiKey(req.context);
    const entity = Object.values(
      await db.find(schema.externalEntity, {
        where: {
          deletedAt: null,
          externalKey: req.input.externalKey,
          organizationId: req.input.organizationId,
        },
      })
    )[0];
    if (!entity) {
      return { status: "not_found" as const };
    }

    const capability =
      entity.type === "issue" ? "issue-tracker" : "pr-tracker";
    const target = await resolveEntityCapabilityTarget(
      db,
      req.input.organizationId,
      entity,
      capability
    );
    if (!target) {
      return { status: "unavailable" as const };
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const raw = await invokeCapability(
          target.entry.invokeUrl,
          {
            capability,
            config: target.integration.configStr,
            method: "readOutcome",
            payload: { entity: buildEntityRef(entity) },
          },
          { secret: connectorInvokeSecret }
        );
        return {
          result: trackerReadOutcomeResultSchema.parse(raw),
          status: "ok" as const,
        };
      } catch (error) {
        lastError = error;
      }
    }
    console.error(
      `Failed to read external outcome for ${entity.externalKey}:`,
      lastError
    );
    return { status: "unavailable" as const };
  }),

  /**
   * Soft-delete the mirror row (issue deletion / transfer-out). No-op when the
   * entity was never mirrored.
   */
  softDelete: mutation(
    z.object({
      organizationId: z.string(),
      externalKey: z.string(),
    })
  ).handler(async ({ req, db }) => {
    requireInternalApiKey(req.context);

    const { organizationId, externalKey } = req.input;

    const deleted = await db.transaction(async ({ trx }) => {
      const existing = Object.values(
        await trx.find(schema.externalEntity, {
          where: { organizationId, externalKey },
        })
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
      // Delete variant carries identity only (see prIndexDeleteSchema) — the
      // embed content is meaningless for a drop.
      const jobData: PrIndexJobData = {
        organizationId,
        externalEntityId: deleted.id,
        externalKey,
        deleted: true,
      };
      enqueuePrIndex(jobData).catch((error) => {
        console.error(
          `Failed to enqueue PR index delete for ${externalKey}:`,
          error
        );
      });
    }

    // Same for the issue vector. Deletion is the *only* mirror event that drops
    // an issue from the index — a closed issue stays searchable by design.
    if (deleted && deleted.type === "issue") {
      const jobData: IssueIndexJobData = {
        organizationId,
        externalEntityId: deleted.id,
        externalKey,
        deleted: true,
      };
      enqueueIssueIndex(jobData).catch((error) => {
        console.error(
          `Failed to enqueue issue index delete for ${externalKey}:`,
          error
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
    })
  ).handler(async ({ req, db }) => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DEV_ONLY");
    }

    const { organizationId } = req.input;

    authorize(req, { organizationId });

    const integration = Object.values(
      await db.find(schema.integration, {
        where: { organizationId, type: "github", enabled: true },
      })
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
        })
      )
    );

    const enqueued = results.filter(
      (result): result is PromiseFulfilledResult<string> =>
        result.status === "fulfilled" && result.value !== null
    ).length;

    return { enqueued, repos: repos.length };
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

    const write = await db.transaction(async ({ trx }) => {
      const existing = Object.values(
        await trx.find(schema.externalEntity, {
          where: { organizationId, externalKey },
        })
      )[0];

      if (existing) {
        await trx.update(schema.externalEntity, existing.id, {
          ...req.input,
          lastSyncedAt: now,
          deletedAt: null,
        });
        return { id: existing.id, previous: existing };
      }

      const newId = ulid().toLowerCase();
      await trx.insert(schema.externalEntity, {
        id: newId,
        ...req.input,
        lastSyncedAt: now,
        deletedAt: null,
      });
      return { id: newId, previous: null };
    });
    const { id } = write;

    if (didExternalEntityFinish(write.previous, req.input)) {
      fanOutEntityFinished(db, req.input).catch((error) => {
        console.error(
          `Failed to fan out finished entity ${externalKey}:`,
          error
        );
      });
    }

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

    // Keep the issue vector index current on every mirror write. Index-only:
    // there is no `issue_matched` push trigger, so this never fans out reads.
    if (req.input.type === "issue") {
      const jobData: IssueIndexJobData = {
        organizationId,
        externalEntityId: id,
        externalKey,
        provider: req.input.provider,
        repoFullName: req.input.repoFullName,
        number: req.input.number,
        url: req.input.url,
        title: req.input.title,
        body: req.input.body,
        state: req.input.state,
      };
      enqueueIssueIndex(jobData).catch((error) => {
        console.error(
          `Failed to enqueue issue index for ${externalKey}:`,
          error
        );
      });
    }

    return id;
  }),
}));
