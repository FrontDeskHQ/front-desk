import { useLiveQuery } from "@live-state/sync/client";
import { useMemo } from "react";
import {
  ActionRowSkeleton,
  type ActorContext,
  ThreadReadCard,
  type ThreadWithRelations,
} from "~/components/signals/action-row";
import { CaughtUpEmpty, NewOrgEmpty } from "~/components/signals/empty-states";
import { Greeting } from "~/components/signals/greeting";
import { query } from "~/lib/live-state";

type Props = {
  organizationId: string;
  ctx: ActorContext;
  isNewOrg?: boolean;
  userName: string;
};

export function ActionList({ organizationId, ctx, isNewOrg, userName }: Props) {
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
          const agentReadTime = (read: (typeof a)["agentRead"]) =>
            read.createdAt ? new Date(read.createdAt).getTime() : 0;
          const timeDiff =
            agentReadTime(b.agentRead) - agentReadTime(a.agentRead);
          if (timeDiff !== 0) return timeDiff;
          return b.createdAt.getTime() - a.createdAt.getTime();
        }),
    [threads],
  );

  if (!threads) {
    return (
      <>
        <Greeting userName={userName} />
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
          <ActionRowSkeleton />
          <ActionRowSkeleton />
          <ActionRowSkeleton />
        </div>
      </>
    );
  }

  if (feedThreads.length === 0) {
    return isNewOrg ? <NewOrgEmpty /> : <CaughtUpEmpty />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      <Greeting userName={userName} />
      <div className="px-1 text-lg text-foreground-primary">
        {feedThreads.length === 1 ? "Here's" : "Here are"} {feedThreads.length}{" "}
        {feedThreads.length === 1
          ? "thing that requires"
          : "things that require"}{" "}
        your attention
      </div>
      <div className="flex flex-col gap-4">
        {feedThreads.map((thread) => (
          <ThreadReadCard key={thread.id} thread={thread} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}
