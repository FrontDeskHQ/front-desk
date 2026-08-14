import { Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  treeContentClassName,
  TreeJoin,
  treeRowClassName,
  TreeSkip,
  TREE_ROW_GAP_PX,
} from "@workspace/ui/components/tree";
import { cn } from "@workspace/ui/lib/utils";

import { ThreadSummaryHoverCard } from "~/components/chips";
import { buildThreadParam } from "~/utils/thread";

import { ActionRow } from "../action-row";
import type { ActorContext } from "../handlers";
import { ThreadReadProvider, useThreadRead } from "./context";
import type { ThreadWithAgentRead, ThreadWithRelations } from "./context";
import { ThreadRead } from "./pieces";

function ThreadRef({ thread }: { thread: ThreadWithRelations }) {
  return (
    <ThreadSummaryHoverCard thread={thread}>
      <Link
        to="/app/threads/$id"
        params={{ id: buildThreadParam(thread) }}
        className="inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <Avatar
          variant="user"
          size="md"
          fallback={thread.author?.name}
          src={thread.author?.user?.image ?? undefined}
        />
        <span className="text-foreground-primary">{thread.name}</span>
        {thread.shortId !== null && (
          <span className="text-foreground-secondary tabular-nums">
            #{thread.shortId}
          </span>
        )}
      </Link>
    </ThreadSummaryHoverCard>
  );
}

function FeedHeader() {
  const { state } = useThreadRead();
  return (
    <>
      <div className="flex flex-col">
        <div className="flex min-h-8 w-full items-center gap-2 pr-16 text-sm text-foreground-primary">
          <ThreadRef thread={state.thread} />
          <ThreadRead.Timestamp />
        </div>
        <div className={cn(treeRowClassName, "items-start")}>
          {state.read.recommendation ? (
            <TreeSkip
              stretchStart={TREE_ROW_GAP_PX}
              stretchEnd={TREE_ROW_GAP_PX}
            />
          ) : (
            <TreeJoin
              isLast
              stretchStart={TREE_ROW_GAP_PX}
              className="h-8 self-start"
            />
          )}
          <div className={cn(treeContentClassName, "items-start")}>
            <ThreadRead.Summary />
          </div>
        </div>
        {state.read.recommendation ? (
          <div className={cn(treeRowClassName, "items-start")}>
            <TreeJoin
              isLast
              stretchStart={TREE_ROW_GAP_PX}
              className="h-8 self-start"
            />
            <div className={cn(treeContentClassName, "items-start")}>
              <ThreadRead.Recommendation />
            </div>
          </div>
        ) : null}
        <ThreadRead.InlineSuggestions className="py-1 pl-5" />
      </div>
      <ActionRow.TopActions>
        <ThreadRead.Reasoning />
        <ThreadRead.DismissFeed />
      </ActionRow.TopActions>
    </>
  );
}

export function FeedThreadRead({
  thread,
  ctx,
}: {
  thread: ThreadWithAgentRead;
  ctx: ActorContext;
}) {
  return (
    <ThreadReadProvider thread={thread} ctx={ctx}>
      <ThreadRead.Root>
        <ActionRow.Header>
          <FeedHeader />
        </ActionRow.Header>
        <ThreadRead.ReplyEditor />
        <ActionRow.Actions>
          <ThreadRead.FooterActions />
        </ActionRow.Actions>
      </ThreadRead.Root>
    </ThreadReadProvider>
  );
}
