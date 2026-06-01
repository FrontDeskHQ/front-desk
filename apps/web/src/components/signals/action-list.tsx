import { useLiveQuery } from "@live-state/sync/client";
import { useMemo } from "react";
import {
  ActionRowSkeleton,
  type ActorContext,
  ThreadReadCard,
  type ThreadWithRelations,
} from "~/components/signals/action-row";
import { CaughtUpEmpty, NewOrgEmpty } from "~/components/signals/empty-states";
import { query } from "~/lib/live-state";

type Props = {
  organizationId: string;
  ctx: ActorContext;
  isNewOrg?: boolean;
};

const EMPTY_THREAD_ID = "__none__";

export function ActionList({ organizationId, ctx, isNewOrg }: Props) {
  const threads = useLiveQuery(
    query.thread
      .where({
        organizationId,
        deletedAt: null,
      })
      .include({
        author: { include: { user: true } },
        assignedUser: { include: { user: true } },
      }),
  );

  const feedThreads = useMemo(
    () =>
      (threads ?? [])
        .filter(
          (
            thread,
          ): thread is ThreadWithRelations & {
            agentRead: NonNullable<ThreadWithRelations["agentRead"]>;
          } => thread.agentRead != null,
        )
        .sort((a, b) => {
          const urgencyDiff =
            b.agentRead.urgencyScore - a.agentRead.urgencyScore;
          if (urgencyDiff !== 0) return urgencyDiff;
          const readTime = (read: (typeof a)["agentRead"]) =>
            read.createdAt
              ? new Date(read.createdAt).getTime()
              : 0;
          const timeDiff = readTime(b.agentRead) - readTime(a.agentRead);
          if (timeDiff !== 0) return timeDiff;
          return b.createdAt.getTime() - a.createdAt.getTime();
        }),
    [threads],
  );

  const relatedThreadIds = useMemo(() => {
    const ids = new Set<string>();
    for (const thread of feedThreads) {
      for (const action of thread.agentRead.primary) {
        if (action.kind === "mark_duplicate") {
          ids.add(action.targetThreadId);
        }
      }
      for (const action of thread.agentRead.alternatives ?? []) {
        if (action.kind === "mark_duplicate") {
          ids.add(action.targetThreadId);
        }
      }
    }
    return ids.size > 0 ? Array.from(ids) : [EMPTY_THREAD_ID];
  }, [feedThreads]);

  const relatedThreads = useLiveQuery(
    query.thread
      .where({
        organizationId,
        id: { $in: relatedThreadIds },
      })
      .include({
        author: { include: { user: true } },
        assignedUser: { include: { user: true } },
      }),
  );

  const relatedThreadsMap = useMemo(() => {
    const map = new Map<string, ThreadWithRelations>();
    for (const thread of relatedThreads ?? []) {
      map.set(thread.id, thread);
    }
    return map;
  }, [relatedThreads]);

  if (!threads) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
        <ActionRowSkeleton />
        <ActionRowSkeleton />
        <ActionRowSkeleton />
      </div>
    );
  }

  if (feedThreads.length === 0) {
    return isNewOrg ? <NewOrgEmpty /> : <CaughtUpEmpty />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      <div className="px-1 text-lg text-foreground-primary">
        {feedThreads.length === 1 ? "Here's" : "Here are"} {feedThreads.length}{" "}
        {feedThreads.length === 1
          ? "thing that requires"
          : "things that require"}{" "}
        your attention
      </div>
      <div className="flex flex-col gap-4">
        {feedThreads.map((thread) => (
          <ThreadReadCard
            key={thread.id}
            thread={thread}
            relatedThreads={relatedThreadsMap}
            ctx={ctx}
          />
        ))}
      </div>
    </div>
  );
}
