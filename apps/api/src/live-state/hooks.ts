import { defineHooks } from "@live-state/sync/server";
import { isOutbound } from "@workspace/schemas/message-roles";

import { isOrganizationMember } from "../lib/organization-membership";
import { areWorkerJobsEnabled, enqueueThreadRead } from "../lib/queue";
import { schema } from "./schema";

export const liveStateHooks = defineHooks<typeof schema>({
  message: {
    afterInsert: ({ db, value }) => {
      (async () => {
        try {
          // Only an inbound message causes a run (ADR 0017). A teammate's
          // reply — typed, accepted from a thread read, or auto-sent — clears
          // the standing read instead, so the Agent's own output never comes
          // back to it as evidence.
          //
          // A lookup that fails counts as inbound, matching what ADR 0017 does
          // with an author it cannot place: a redundant read is visible and
          // self-limiting, a trigger dropped on a transient error is neither.
          let outbound = false;
          try {
            // Hooks receive the raw storage handle, not the `db.<collection>`
            // proxy the ServerDB type advertises, so the collection accessors
            // are undefined here — findOne/find are what actually exist.
            const thread = await db.findOne(schema.thread, value.threadId);
            if (thread) {
              const author = value.authorId
                ? await db.findOne(schema.author, value.authorId)
                : undefined;
              outbound = isOutbound({
                isOrganizationMember: await isOrganizationMember(
                  db,
                  thread.organizationId,
                  author?.userId
                ),
              });
            } else {
              // Not necessarily a missing thread: the ingest path inserts the
              // thread and its first message in one transaction, and this hook
              // body is detached from it, so a new thread's own first message
              // can land here. Enqueue anyway — the worker skips a thread it
              // cannot hydrate, which is cheaper than losing that message's
              // trigger. Logged at info because it is expected traffic, not a
              // fault: only a sustained rate is worth reading anything into.
              console.info(
                `Thread ${value.threadId} not yet visible while classifying message ${value.id}; treating it as inbound`
              );
            }
          } catch (error) {
            console.error(
              `Failed to classify message ${value.id}; treating it as inbound`,
              error
            );
          }

          const queuePriority = value.isBackfill ? "low" : "high";
          const result = await enqueueThreadRead(value.threadId, {
            kind: outbound ? "supersede" : "message",
            priority: queuePriority,
          });

          if (result.reason === "queue_unavailable" && areWorkerJobsEnabled()) {
            const outcome =
              result.disposition === "buffered"
                ? "buffered durably and awaiting recovery"
                : "skipping enqueue";
            console.warn(
              `Thread-read queue unavailable; ${outcome} for thread ${value.threadId}`
            );
          }
        } catch (error) {
          console.error(
            `Unhandled error in afterInsert thread-read enqueue for message ${value.id}`,
            error
          );
        }
      })();
    },
  },
});
