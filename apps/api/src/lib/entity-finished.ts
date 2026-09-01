import type { ServerDB } from "@live-state/sync/server";

import { schema } from "../live-state/schema";
import { enqueueThreadRead } from "./queue";

export interface ExternalEntityFinishState {
  externalKey: string;
  merged: boolean | null;
  organizationId: string;
  state: string;
  type: string;
  url: string;
}

const ACTIVE_THREAD_STATUSES = new Set([0, 1]);

export const isExternalEntityFinished = (
  entity: ExternalEntityFinishState
): boolean =>
  entity.type === "issue"
    ? entity.state.toLowerCase() === "closed"
    : entity.type === "pull_request" && entity.merged === true;

/** Initial closed backfills are facts, not transitions, and do not fan out. */
export const didExternalEntityFinish = (
  previous: ExternalEntityFinishState | null,
  current: ExternalEntityFinishState
): boolean =>
  previous !== null &&
  !isExternalEntityFinished(previous) &&
  isExternalEntityFinished(current);

type EntityFinishedDb = Pick<ServerDB<typeof schema>, "find">;

/**
 * Best-effort fan-out to linked live threads. Redis acceptance is the durable
 * boundary; callers deliberately do not roll mirror/link writes back if the
 * queue is unavailable. Manual replay is the recovery path.
 */
export const fanOutEntityFinished = async (
  db: EntityFinishedDb,
  entity: ExternalEntityFinishState,
  onlyThreadId?: string
) => {
  if (
    !isExternalEntityFinished(entity) ||
    (entity.type !== "issue" && entity.type !== "pull_request")
  ) {
    return { enqueued: 0, jobIds: [] as string[], unavailable: 0 };
  }

  const linked = Object.values(
    await db.find(schema.thread, {
      where:
        entity.type === "issue"
          ? {
              deletedAt: null,
              externalIssueId: entity.externalKey,
              organizationId: entity.organizationId,
            }
          : {
              deletedAt: null,
              externalPrId: entity.externalKey,
              organizationId: entity.organizationId,
            },
    })
  );
  const threads = linked.filter(
    (thread) =>
      ACTIVE_THREAD_STATUSES.has(thread.status) &&
      (onlyThreadId === undefined || thread.id === onlyThreadId)
  );

  const jobIds: string[] = [];
  let enqueued = 0;
  let unavailable = 0;
  for (const thread of threads) {
    const result = await enqueueThreadRead(thread.id, {
      entityFinished: {
        externalKey: entity.externalKey,
        type: entity.type,
        url: entity.url,
      },
      kind: "entity_finished",
      organizationId: entity.organizationId,
    });
    if (result.jobId) {
      jobIds.push(result.jobId);
    }
    if (result.disposition !== "skipped") {
      enqueued += 1;
    }
    if (
      result.reason === "queue_unavailable" &&
      result.disposition !== "buffered"
    ) {
      unavailable += 1;
    }
  }

  return {
    enqueued,
    jobIds,
    unavailable,
  };
};
