/* mirror: thread-read signal card — apps/web/src/components/signals/action-row/thread-read-card.tsx
 * fork: apps/web/src/components/signals/action-row/thread-read-card.tsx @ d83ec749
 *   why: live-state, Link, handlers, mutate, reply draft editor
 * reuse: ActionRow, Avatar, TreeJoin, TreeSkip, ActionButton, ThreadChip, MockRichMarkdown, ACTION_KIND_LABEL, ACTION_KIND_VERB
 * state: static card from props — primary/alternative action kinds drive button row
 * marketing: none
 */

import {
  ACTION_KIND_LABEL,
  ACTION_KIND_VERB,
  urgencyTierFromScore,
} from "@workspace/schemas/signals";
import type { ActionKind } from "@workspace/schemas/signals";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import {
  TreeJoin,
  TreeSkip,
  TREE_ROW_GAP_PX,
} from "@workspace/ui/components/tree";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";

import { ActionRow } from "~/components/signals/action-row";

import { THREAD_REFERENCES } from "./data";
import { MockRichMarkdown } from "./mock-rich-markdown";
import type { MockSignalCardData } from "./types";

const treeRowClassName =
  "flex min-h-8 min-w-0 items-stretch gap-1 overflow-visible text-sm";

const treeContentClassName =
  "flex min-w-0 flex-1 gap-2 py-1 text-foreground-primary";

function orderReplyFirst(kinds: ActionKind[]): ActionKind[] {
  return [...kinds].sort((a, b) => {
    const aReply = a === "reply" ? 0 : 1;
    const bReply = b === "reply" ? 0 : 1;
    if (aReply !== bReply) {
      return aReply - bReply;
    }
    return kinds.indexOf(a) - kinds.indexOf(b);
  });
}

function compoundButtonLabel(primaryKinds: ActionKind[]): string {
  const ordered = orderReplyFirst(primaryKinds);
  if (ordered.length === 0) {
    return "Select an action";
  }

  const verbAt = (kind: ActionKind, position: number): string => {
    const verb = ACTION_KIND_VERB[kind];
    return position === 0 ? verb.charAt(0).toUpperCase() + verb.slice(1) : verb;
  };

  const first = verbAt(ordered[0], 0);
  if (ordered.length === 1) {
    return first;
  }
  if (ordered.length === 2) {
    return `${first} and ${verbAt(ordered[1], 1)}`;
  }
  return `${first} and do ${ordered.length - 1} actions`;
}

interface MockSignalCardProps {
  signal: MockSignalCardData;
}

export function MockSignalCard({ signal }: MockSignalCardProps) {
  const { alternativeKinds = [], primaryKinds } = signal;

  return (
    <ActionRow.Root tier={urgencyTierFromScore(signal.urgencyScore)}>
      <ActionRow.Header>
        <div className="flex flex-col">
          <div className="flex min-h-8 w-full items-center gap-2 pr-16 text-sm text-foreground-primary">
            <div className="inline-flex w-fit items-center gap-1.5 text-sm">
              <Avatar variant="user" size="md" fallback={signal.authorName} />
              <span className="text-foreground-primary">{signal.title}</span>
              <span className="text-foreground-secondary tabular-nums">
                #{signal.shortId}
              </span>
            </div>
            <ActionRow.Meta>
              {formatRelativeTime(signal.createdAt)}
            </ActionRow.Meta>
          </div>
          <div className={cn(treeRowClassName, "items-start")}>
            {signal.recommendation ? (
              <TreeSkip
                stretchStart={TREE_ROW_GAP_PX}
                stretchEnd={TREE_ROW_GAP_PX}
              />
            ) : (
              <TreeJoin isLast stretchStart={TREE_ROW_GAP_PX} />
            )}
            <div className={cn(treeContentClassName, "items-start")}>
              <MockRichMarkdown
                content={signal.summary}
                preset="inline"
                threadReferences={THREAD_REFERENCES}
                className={
                  signal.recommendation
                    ? "text-foreground-secondary"
                    : "text-foreground-primary"
                }
              />
            </div>
          </div>
          {signal.recommendation ? (
            <div className={cn(treeRowClassName, "items-start")}>
              <TreeJoin isLast stretchStart={TREE_ROW_GAP_PX} />
              <div className={cn(treeContentClassName, "items-start")}>
                <MockRichMarkdown
                  content={signal.recommendation}
                  preset="inline"
                  threadReferences={THREAD_REFERENCES}
                  className="text-foreground-primary"
                />
              </div>
            </div>
          ) : null}
        </div>
        <ActionRow.TopActions>
          <ActionRow.Dismiss onClick={() => {}} label="Dismiss read" />
        </ActionRow.TopActions>
      </ActionRow.Header>
      <ActionRow.Actions>
        {alternativeKinds.map((kind) => (
          <ActionButton
            key={`${signal.id}:alternative:${kind}`}
            size="sm"
            variant="secondary"
            tabIndex={-1}
          >
            {ACTION_KIND_LABEL[kind]}
          </ActionButton>
        ))}
        {primaryKinds.length > 0 ? (
          <ActionButton size="sm" variant="primary" tabIndex={-1}>
            {compoundButtonLabel(primaryKinds)}
          </ActionButton>
        ) : null}
      </ActionRow.Actions>
    </ActionRow.Root>
  );
}
