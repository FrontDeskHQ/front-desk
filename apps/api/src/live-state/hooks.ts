import { defineHooks } from "@live-state/sync/server";
import { isOutbound } from "@workspace/schemas/message-roles";

import { isOrganizationMember } from "../lib/organization-membership";
import { areWorkerJobsEnabled, enqueueThreadRead } from "../lib/queue";
import type { schema } from "./schema";

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
            const thread = await db.thread.one(value.threadId).get();
            const author = await db.author.one(value.authorId).get();
            outbound = isOutbound({
              isOrganizationMember: thread
                ? await isOrganizationMember(
                    db,
                    thread.organizationId,
                    author?.userId
                  )
                : false,
            });
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
