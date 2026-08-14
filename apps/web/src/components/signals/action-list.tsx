import { useLiveQuery } from "@live-state/sync/client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

import {
  ActionRowSkeleton,
  FeedThreadRead,
} from "~/components/signals/action-row";
import type {
  ActorContext,
  ThreadWithRelations,
} from "~/components/signals/action-row";
import { CaughtUpEmpty, NewOrgEmpty } from "~/components/signals/empty-states";
import { Greeting } from "~/components/signals/greeting";
import { query } from "~/lib/live-state";

interface Props {
  organizationId: string;
  ctx: ActorContext;
  isNewOrg?: boolean;
  userName: string;
}

/** Enter/exit — user-initiated presence. */
const EASE_OUT_CUBIC = [0.215, 0.61, 0.355, 1] as const;
/** Remaining rows already on screen sliding to fill the gap. */
const EASE_IN_OUT_CUBIC = [0.645, 0.045, 0.355, 1] as const;

const ENTER_MS = 0.2;
const EXIT_MS = 0.16;

export function ActionList({ organizationId, ctx, isNewOrg, userName }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const threads = useLiveQuery(
    query.thread
      .where({
        deletedAt: null,
        organizationId,
      })
      .include({
        assignedUser: { include: { user: true } },
        author: { include: { user: true } },
      })
  );

  const feedThreads = useMemo(
    () =>
      (threads ?? [])
        .filter(
          (
            thread
          ): thread is ThreadWithRelations & {
            agentRead: NonNullable<ThreadWithRelations["agentRead"]>;
          } => thread.agentRead !== null && thread.agentRead !== undefined
        )
        .sort((a, b) => {
          const agentReadTime = (read: (typeof a)["agentRead"]) =>
            read.createdAt ? new Date(read.createdAt).getTime() : 0;
          const timeDiff =
            agentReadTime(b.agentRead) - agentReadTime(a.agentRead);
          if (timeDiff !== 0) {
            return timeDiff;
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        }),
    [threads]
  );

  const enterTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: ENTER_MS, ease: EASE_OUT_CUBIC };
  const exitTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: EXIT_MS, ease: EASE_OUT_CUBIC };
  const layoutTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: ENTER_MS, ease: EASE_IN_OUT_CUBIC };

  if (!threads) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
        <ActionRowSkeleton />
        <ActionRowSkeleton />
        <ActionRowSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <AnimatePresence initial={false} mode="popLayout">
        {feedThreads.length > 0 ? (
          <motion.div
            key="feed-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitTransition }}
            transition={enterTransition}
            className="flex flex-col gap-3"
          >
            <Greeting userName={userName} />
            <div className="px-1 text-lg text-foreground-primary">
              {feedThreads.length === 1 ? "Here's" : "Here are"}{" "}
              {feedThreads.length}{" "}
              {feedThreads.length === 1
                ? "thing that requires"
                : "things that require"}{" "}
              your attention
            </div>
          </motion.div>
        ) : null}
        {feedThreads.map((thread) => (
          <motion.div
            key={thread.id}
            layout={shouldReduceMotion ? false : "position"}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.95,
              y: -6,
              transition: exitTransition,
            }}
            transition={{
              ...enterTransition,
              layout: layoutTransition,
            }}
            style={{ transformOrigin: "top center" }}
          >
            <FeedThreadRead thread={thread} ctx={ctx} />
          </motion.div>
        ))}
        {feedThreads.length === 0 ? (
          <motion.div
            key="feed-empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: 0.95,
              transition: exitTransition,
            }}
            transition={enterTransition}
          >
            {isNewOrg ? <NewOrgEmpty /> : <CaughtUpEmpty />}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
