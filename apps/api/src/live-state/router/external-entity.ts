// TODO refactor with new live-state mental model
import { ulid } from "ulid";
import { z } from "zod";
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

export default privateRoute
  .collectionRoute(schema.externalEntity, {
    read: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        organization: {
          organizationUsers: {
            userId: ctx.session.userId,
            enabled: true,
          },
        },
      };
    },
    // Writes go through the custom procedures only.
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withMutations(({ mutation }) => ({
    /**
     * Insert or update the mirror row identified by
     * `(organizationId, externalKey)`. Refreshes `lastSyncedAt` and clears any
     * previous `deletedAt` (a live event means the entity exists again).
     *
     * The find-then-insert/update runs inside a transaction so concurrent
     * events for the same entity don't race into duplicate rows.
     */
    upsert: mutation(externalEntityFields).handler(async ({ req, db }) => {
      if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      const { organizationId, externalKey } = req.input;
      const now = new Date();

      return db.transaction(async ({ trx }) => {
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

        const id = ulid().toLowerCase();
        await trx.insert(schema.externalEntity, {
          id,
          ...req.input,
          lastSyncedAt: now,
          deletedAt: null,
        });
        return id;
      });
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
      if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      const { organizationId, externalKey } = req.input;

      return db.transaction(async ({ trx }) => {
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
        return existing.id;
      });
    }),
  }));
