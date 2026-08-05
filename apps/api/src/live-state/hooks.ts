import { defineHooks } from "@live-state/sync/server";

import { areWorkerJobsEnabled, enqueueThreadRead } from "../lib/queue";
import type { schema } from "./schema";

export const liveStateHooks = defineHooks<typeof schema>({
  message: {
    afterInsert: ({ value }) => {
      (async () => {
        try {
          // TODO(issue-06): when the author is outbound (teammate or Agent),
          // dispatch kind:"supersede" instead so the worker handler can null
          // thread.agentRead without invoking synthesis.
          const queuePriority = value.isBackfill ? "low" : "high";
          const result = await enqueueThreadRead(value.threadId, {
            kind: "message",
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
