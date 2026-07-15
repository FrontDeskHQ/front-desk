// TODO refactor with new live-state mental model
import { supportEntryPointIngestSchema } from "@connectors/framework";
import { ulid } from "ulid";
import { requireInternalApiKey } from "../../lib/authorize";
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
 *   `provider:` prefixing convention.
 *
 * `isBackfill` is written onto the message rows and only influences downstream
 * pipeline triggers (via the message `afterInsert` hook); it does not change
 * normalization. Inbound status changes stay a separate generic mutation.
 *
 * See `docs/adr/0009-emitting-side-connector-retrofit.md`.
 */
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
        isBackfill,
      } = req.input;

      const metaId = `${provider}:${author.externalId}`;
      const content = serializeMessageContent(message.body);

      return db.transaction(async ({ trx }) => {
        // Author find-or-create/dedup, keyed on (organizationId, metaId).
        const existingAuthor = await trx.author
          .first({ metaId, organizationId })
          .get();

        let authorId = existingAuthor?.id;
        if (!authorId) {
          authorId = ulid().toLowerCase();
          await trx.author.insert({
            id: authorId,
            name: author.name,
            organizationId,
            metaId,
            userId: null,
          });
        }

        // Locate the thread for this external thread within the org. Scope by
        // provider too: two providers can mint the same raw external id, and
        // conflating them would append messages to the wrong conversation.
        const existingThread = await trx.thread
          .first({
            organizationId,
            externalId: externalThreadId,
            externalOrigin: provider,
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
              id: ulid().toLowerCase(),
              authorId,
              content,
              threadId: existingThread.id,
              createdAt: message.createdAt,
              origin: provider,
              externalMessageId: message.externalMessageId,
              isBackfill,
            });
          }

          return { thread: existingThread, created: false };
        }

        // Create path — refuse to create a titleless thread.
        if (!threadDescriptor) {
          throw new Error("INGEST_UNKNOWN_THREAD_WITHOUT_DESCRIPTOR");
        }

        const threadId = ulid().toLowerCase();
        const shortId = await nextThreadShortId(trx, organizationId);

        await trx.thread.insert({
          id: threadId,
          name: threadDescriptor.title,
          organizationId,
          authorId,
          status: 0,
          priority: 0,
          assignedUserId: null,
          createdAt: message.createdAt,
          deletedAt: null,
          // Provider-neutral: the deprecated discord-specific column is left
          // unset; outbound delivery reads `externalId`/`externalOrigin`.
          discordChannelId: null,
          externalIssueId: null,
          externalPrId: null,
          externalId: externalThreadId,
          externalOrigin: provider,
          externalMetadataStr: threadDescriptor.externalMetadata
            ? JSON.stringify(threadDescriptor.externalMetadata)
            : null,
          shortId,
        });

        await trx.message.insert({
          id: ulid().toLowerCase(),
          authorId,
          content,
          threadId,
          createdAt: message.createdAt,
          origin: provider,
          externalMessageId: message.externalMessageId,
          isBackfill,
        });

        const thread = await trx.findOne(schema.thread, threadId);

        return { thread, created: true };
      });
    },
  ),
}));
