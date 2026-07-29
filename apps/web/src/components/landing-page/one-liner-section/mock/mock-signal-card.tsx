/* mirror: thread-read signal card — apps/web/src/components/signals/action-row/thread-read-card.tsx
 * fork: apps/web/src/components/signals/action-row/thread-read-card.tsx @ 59006b69
 *   why: live-state, Link, handlers, mutate, reply draft editor
 * reuse: ActionRow, Avatar, TreeJoin, TreeSkip, ActionButton
 * state: red-tier churn-risk read on webhook thread; Reply primary action
 * marketing: none — pop-in owned by SignalsPage
 */

import { urgencyTierFromScore } from "@workspace/schemas/signals";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import {
  TreeJoin,
  TreeSkip,
  TREE_ROW_GAP_PX,
} from "@workspace/ui/components/tree";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";

import { ActionRow } from "~/components/signals/action-row";

import { SIGNAL } from "./data";

const treeRowClassName =
  "flex min-h-8 min-w-0 items-stretch gap-1 overflow-visible text-sm";

const treeContentClassName =
  "flex min-w-0 flex-1 gap-2 py-1 text-foreground-primary";

export function MockSignalCard() {
  const read = SIGNAL;

  return (
    <ActionRow.Root tier={urgencyTierFromScore(read.urgencyScore)}>
      <ActionRow.Header>
        <div className="flex flex-col">
          <div className="flex min-h-8 w-full items-center gap-2 pr-16 text-sm text-foreground-primary">
            <div className="inline-flex w-fit items-center gap-1.5 text-sm">
              <Avatar variant="user" size="md" fallback={read.authorName} />
              <span className="text-foreground-primary">{read.title}</span>
              <span className="text-foreground-secondary tabular-nums">
                #{read.shortId}
              </span>
            </div>
            <ActionRow.Meta>
              {formatRelativeTime(read.createdAt)}
            </ActionRow.Meta>
          </div>
          <div className={cn(treeRowClassName, "items-start")}>
            {read.recommendation ? (
              <TreeSkip
                stretchStart={TREE_ROW_GAP_PX}
                stretchEnd={TREE_ROW_GAP_PX}
              />
            ) : (
              <TreeJoin isLast stretchStart={TREE_ROW_GAP_PX} />
            )}
            <div className={cn(treeContentClassName, "items-start")}>
              <span
                className={
                  read.recommendation
                    ? "text-foreground-secondary"
                    : "text-foreground-primary"
                }
              >
                {read.summary}
              </span>
            </div>
          </div>
          {read.recommendation ? (
            <div className={cn(treeRowClassName, "items-start")}>
              <TreeJoin isLast stretchStart={TREE_ROW_GAP_PX} />
              <div className={cn(treeContentClassName, "items-start")}>
                <span className="text-foreground-primary">
                  {read.recommendation}
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <ActionRow.TopActions>
          <ActionRow.Dismiss onClick={() => {}} label="Dismiss read" />
        </ActionRow.TopActions>
      </ActionRow.Header>
      <ActionRow.Actions>
        <ActionButton size="sm" variant="primary" tabIndex={-1}>
          Reply
        </ActionButton>
      </ActionRow.Actions>
    </ActionRow.Root>
  );
}
