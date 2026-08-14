/* mirror: thread-toolbar SI panel — apps/web/src/components/threads/thread-toolbar/support-intelligence-panel.tsx
 * fork: apps/web/src/components/signals/action-row/thread-read-card.tsx @ d2ef5f42
 *   why: live-state thread + accept/dismiss mutations
 * reuse: ActionRow, ActionButton, RichMarkdown
 * state: thread-surface thread read proposing a reply, draft open
 * marketing: inert — no handlers; Brain/Dismiss/Send are decorative
 */

import { ActionButton } from "@workspace/ui/components/button";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import {
  treeContentClassName,
  TreeJoin,
  treeRowClassName,
  TreeSkip,
  TREE_ROW_GAP_PX,
} from "@workspace/ui/components/tree";
import { cn } from "@workspace/ui/lib/utils";
import { Brain, PenLineIcon } from "lucide-react";

import { RichMarkdown } from "~/components/markdown/rich-markdown";
import { ActionRow } from "~/components/signals/action-row";

export interface MockThreadReadPanelProps {
  summary: string;
  recommendation?: string;
  draft: string;
}

export function MockThreadReadPanel({
  summary,
  recommendation,
  draft,
}: MockThreadReadPanelProps) {
  return (
    <TooltipProvider>
      <ActionRow.Root tier="yellow">
        <ActionRow.Header>
          <div className="flex flex-col">
            <div className="flex min-h-8 w-full items-center gap-2 pr-16 text-sm text-foreground-primary">
              <ActionRow.Meta>just now</ActionRow.Meta>
            </div>
            <div className={cn(treeRowClassName, "items-start")}>
              {recommendation ? (
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
                <RichMarkdown
                  content={summary}
                  preset="inline"
                  className={
                    recommendation
                      ? "text-foreground-secondary"
                      : "text-foreground-primary"
                  }
                />
              </div>
            </div>
            {recommendation ? (
              <div className={cn(treeRowClassName, "items-start")}>
                <TreeJoin
                  isLast
                  stretchStart={TREE_ROW_GAP_PX}
                  className="h-8 self-start"
                />
                <div className={cn(treeContentClassName, "items-start")}>
                  <RichMarkdown
                    content={recommendation}
                    preset="inline"
                    className="text-foreground-primary"
                  />
                </div>
              </div>
            ) : null}
          </div>
          <ActionRow.TopActions>
            <ActionButton size="sm" variant="ghost" tabIndex={-1} aria-hidden>
              <Brain className="size-3.5" />
            </ActionButton>
            <ActionRow.Dismiss onClick={() => undefined} label="Dismiss read" />
          </ActionRow.TopActions>
        </ActionRow.Header>
        <div className="space-y-2 px-3 pt-2 pb-0">
          <div className="flex items-center gap-1.5 text-xs text-foreground-secondary mt-1">
            <PenLineIcon className="size-3.5 shrink-0" />
            <span>Reply draft</span>
          </div>
          <div className="max-h-52 min-h-0 overflow-y-auto text-sm pb-2">
            <RichMarkdown content={draft} preset="inline" />
          </div>
        </div>
        <ActionRow.Actions>
          <ActionButton size="sm" variant="ghost" tabIndex={-1}>
            Cancel
          </ActionButton>
          <ActionButton size="sm" variant="primary" tabIndex={-1}>
            Send
          </ActionButton>
        </ActionRow.Actions>
      </ActionRow.Root>
    </TooltipProvider>
  );
}
