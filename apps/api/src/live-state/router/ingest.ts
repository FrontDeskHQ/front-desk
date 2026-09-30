// TODO refactor with new live-state mental model
import {
  supportEntryPointImportThreadSchema,
  supportEntryPointIngestSchema,
} from "@connectors/framework";
import type { SupportEntryPointImportThreadOutcome } from "@connectors/framework";
import type { ServerDB } from "@live-state/sync/server";
import {
  threadImportAllowance,
  threadImportStatusSchema,
} from "@workspace/schemas/integration/shared";
import { organizationSettingsSchema } from "@workspace/schemas/organization";
import { ulid } from "ulid";
import { z } from "zod";

import { requireInternalApiKey } from "../../lib/authorize";
import { errors } from "../../lib/errors";
import { ensureExternalAuthor } from "../../lib/external-author";
import { firstOrganizationAssigneeId } from "../../lib/organization-membership";
import { enqueueThreadRead } from "../../lib/queue";
import { nextThreadShortId } from "../../lib/thread-short-id";
import { serializeMessageContent } from "../../lib/tiptap-content";
import { publicRoute } from "../factories";
import { schema } from "../schema";

/**
 * The emitting-side (`support-entry-point`) ingest procedure — connector → core.
 *
 * A connector translates a provider event into the neutral `ingest` payload; the
 * core owns all normalization here so connectors stay thin:
 *
 * - **Idempotent** on `(organizationId, externalThreadId, externalMessageId)`.
 * - **Create-vs-append** by whether a thread already exists for the external
 *   thread — not by any connector-side "is this the first message?" guess.
 * - **Hard-errors** when a message targets an unknown external thread with no
 *   `thread` descriptor, rather than create a silent titleless thread.
 * - **Author** find-or-create/dedup on `(organizationId, metaId)` with the
 *   `provider:` prefixing convention, refreshing `name` when the provider
 *   sent a new one (a Slack/Discord rename is the same author).
 *
 * Inbound status changes stay a separate generic mutation.
 *
 * The `*ThreadImport*` / `importThread` procedures serve "Import threads": the
 * connector finds and loads provider history, the core owns the allowance,
 * dedup and the single thread read per imported thread.
 *
 * See `docs/adr/0009-emitting-side-connector-retrofit.md`.
 */
type Db = ServerDB<typeof schema>;

const integrationIdInputSchema = z.object({ integrationId: z.string().min(1) });

const unknownExternalThreadsInputSchema = z.object({
  externalThreadIds: z.array(z.string().min(1)).max(1000),
  integrationId: z.string().min(1),
  provider: z.string().min(1),
});

const reportThreadImportInputSchema = z.object({
  integrationId: z.string().min(1),
  status: threadImportStatusSchema,
});

const requireIntegration = async (db: Db, integrationId: string) => {
  const integration = await db.integration.one(integrationId).get();
  if (!integration) {
    throw errors.notFound("integration");
  }
  return integration;
};

/**
 * Threads this organization may still import, or `null` when its plan is
 * unlimited. Used allowance is the number of threads an import created, so a
 * failed or skipped thread never spends it and nothing is counted twice.
 */
const remainingThreadImportAllowance = async (
  db: Db,
  organizationId: string
): Promise<number | null> => {
  const organization = await db.organization.one(organizationId).get();
  const plan = organizationSettingsSchema.shape.plan.parse(
    organization?.settings?.plan
  );
  const limit = threadImportAllowance(plan);
  if (limit === null) {
    return null;
  }
  const imported = await db.find(schema.thread, {
    where: { importedAt: { $not: null }, organizationId },
  });
  return Math.max(0, limit - Object.keys(imported).length);
};

export const ingestRoute = publicRoute.withProcedures(({ mutation }) => ({
  ingest: mutation(supportEntryPointIngestSchema).handler(
    async ({ req, db }) => {
      // Ingest is connector → core; only the internal bot keys may call it.
      requireInternalApiKey(req.context);

      const {
        organizationId,
        provider,
        externalThreadId,
        thread: threadDescriptor,
        message,
        author,
      } = req.input;

      const metaId = `${provider}:${author.externalId}`;
      const content = serializeMessageContent(message.body);

      return db.transaction(async ({ trx }) => {
        const authorId = await ensureExternalAuthor(trx, {
          metaId,
          name: author.name,
          organizationId,
        });

        // Locate the thread for this external thread within the org. Scope by
        // provider too: two providers can mint the same raw external id, and
        // conflating them would append messages to the wrong conversation.
        const existingThread = await trx.thread
          .first({
            externalId: externalThreadId,
            externalOrigin: provider,
            organizationId,
          })
          .get();

        // Append path.
        if (existingThread) {
          // Idempotent: a message we've already ingested is a no-op.
          const existingMessage = await trx.message
            .first({
              externalMessageId: message.externalMessageId,
              threadId: existingThread.id,
            })
            .get();

          if (!existingMessage) {
            await trx.message.insert({
              authorId,
              content,
              createdAt: message.createdAt,
              externalMessageId: message.externalMessageId,
              id: ulid().toLowerCase(),
              origin: provider,
              threadId: existingThread.id,
            });
          }

          return { created: false, thread: existingThread };
        }

        // Create path — refuse to create a titleless thread.
        if (!threadDescriptor) {
          throw errors.badRequest(
            "INGEST_UNKNOWN_THREAD_WITHOUT_DESCRIPTOR",
            "A thread descriptor is required to ingest a message for an unknown thread"
          );
        }

        const threadId = ulid().toLowerCase();
        const shortId = await nextThreadShortId(trx, organizationId);
        const assignedUserId = await firstOrganizationAssigneeId(
          trx,
          organizationId
        );

        await trx.thread.insert({
          assignedUserId,
          authorId,
          createdAt: message.createdAt,
          deletedAt: null,
          externalId: externalThreadId,
          externalIssueId: null,
          externalMetadataStr: threadDescriptor.externalMetadata
            ? JSON.stringify(threadDescriptor.externalMetadata)
            : null,
          externalOrigin: provider,
          externalPrId: null,
          id: threadId,
          name: threadDescriptor.title,
          organizationId,
          priority: 0,
          shortId,
          status: 0,
        });

        await trx.message.insert({
          authorId,
          content,
          createdAt: message.createdAt,
          externalMessageId: message.externalMessageId,
          id: ulid().toLowerCase(),
          origin: provider,
          threadId,
        });

        const thread = await trx.findOne(schema.thread, threadId);

        return { created: true, thread };
      });
    }
  ),
  /** How many more threads the integration's organization may import. */
  threadImportAllowance: mutation(integrationIdInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);
      const integration = await requireIntegration(db, req.input.integrationId);
      return {
        remaining: await remainingThreadImportAllowance(
          db,
          integration.organizationId
        ),
      };
    }
  ),

  /** The subset of `externalThreadIds` with no FrontDesk thread yet. */
  unknownExternalThreads: mutation(unknownExternalThreadsInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);
      const integration = await requireIntegration(db, req.input.integrationId);
      const known = await db.find(schema.thread, {
        where: {
          externalId: { $in: req.input.externalThreadIds },
          externalOrigin: req.input.provider,
          organizationId: integration.organizationId,
        },
      });
      const knownIds = new Set(
        Object.values(known).map((thread) => thread.externalId)
      );
      return {
        externalThreadIds: req.input.externalThreadIds.filter(
          (id) => !knownIds.has(id)
        ),
      };
    }
  ),

  reportThreadImport: mutation(reportThreadImportInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);
      await requireIntegration(db, req.input.integrationId);
      await db.update(schema.integration, req.input.integrationId, {
        threadImport: req.input.status,
        updatedAt: new Date(),
      });
      return { ok: true };
    }
  ),

  /**
   * Store one complete historical thread. The thread and all its messages
   * land in one transaction, so it only becomes visible whole. It starts Open
   * and unassigned, keeps provider timestamps, and gets exactly one
   * low-priority thread read once committed, so live traffic reads first.
   *
   * An external thread FrontDesk already has is left alone (`exists`), and
   * nothing is created once the allowance is spent (`exhausted`).
   */
  importThread: mutation(supportEntryPointImportThreadSchema).handler(
    async ({
      req,
      db,
    }): Promise<{ outcome: SupportEntryPointImportThreadOutcome }> => {
      requireInternalApiKey(req.context);
      const { externalThreadId, provider } = req.input;
      // The root is the earliest message; don't trust connector ordering.
      const messages = req.input.messages.toSorted(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      const integration = await requireIntegration(db, req.input.integrationId);
      if (integration.type !== provider) {
        throw errors.badRequest(
          "IMPORT_PROVIDER_MISMATCH",
          "The import provider doesn't match the integration"
        );
      }
      const { organizationId } = integration;

      const result = await db.transaction(async ({ trx }) => {
        // Re-read in the transaction: an owner may disable the integration
        // while a run is in flight.
        const current = await trx.integration.one(integration.id).get();
        if (!current?.enabled) {
          throw errors.badRequest(
            "INTEGRATION_DISABLED",
            "The integration was disabled during the import"
          );
        }

        // TODO: enforce (organizationId, externalOrigin, externalId) as unique
        // once live-state supports composite indexes; until then a live
        // ingest racing this import for the same thread can duplicate it.
        const existing = await trx.thread
          .first({
            externalId: externalThreadId,
            externalOrigin: provider,
            organizationId,
          })
          .get();
        if (existing) {
          return { outcome: "exists" as const };
        }

        // Not locked: imports running at once for two integrations of one
        // organization can overshoot the allowance by a thread or two.
        const remaining = await remainingThreadImportAllowance(
          trx,
          organizationId
        );
        if (remaining !== null && remaining <= 0) {
          return { outcome: "exhausted" as const };
        }

        // Resolve each distinct author once for the whole thread.
        const authorIds = new Map<string, string>();
        const authorIdFor = async (externalId: string, name: string) => {
          const metaId = `${provider}:${externalId}`;
          let authorId = authorIds.get(metaId);
          if (!authorId) {
            authorId = await ensureExternalAuthor(trx, {
              metaId,
              name,
              organizationId,
            });
            authorIds.set(metaId, authorId);
          }
          return authorId;
        };

        const [root] = messages;
        if (!root) {
          throw errors.badRequest(
            "IMPORT_THREAD_WITHOUT_MESSAGES",
            "An imported thread needs at least one message"
          );
        }
        const threadId = ulid().toLowerCase();
        await trx.thread.insert({
          assignedUserId: null,
          authorId: await authorIdFor(root.author.externalId, root.author.name),
          createdAt: root.createdAt,
          deletedAt: null,
          externalId: externalThreadId,
          externalIssueId: null,
          externalMetadataStr: req.input.thread.externalMetadata
            ? JSON.stringify(req.input.thread.externalMetadata)
            : null,
          externalOrigin: provider,
          externalPrId: null,
          id: threadId,
          importedAt: new Date(),
          name: req.input.thread.title,
          organizationId,
          priority: 0,
          shortId: await nextThreadShortId(trx, organizationId),
          status: 0,
        });

        const seen = new Set<string>();
        for (const message of messages) {
          if (seen.has(message.externalMessageId)) {
            continue;
          }
          seen.add(message.externalMessageId);
          await trx.message.insert({
            authorId: await authorIdFor(
              message.author.externalId,
              message.author.name
            ),
            content: serializeMessageContent(message.body),
            createdAt: message.createdAt,
            externalMessageId: message.externalMessageId,
            id: ulid().toLowerCase(),
            isBackfill: true,
            origin: provider,
            threadId,
          });
        }

        return { outcome: "imported" as const, threadId };
      });

      if (result.outcome === "imported") {
        await enqueueThreadRead(result.threadId, {
          kind: "message",
          organizationId,
          priority: "low",
        });
      }

      return { outcome: result.outcome };
    }
  ),
}));
