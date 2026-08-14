/* mirror: thread-toolbar SI panel — apps/web/src/components/threads/thread-toolbar/support-intelligence-panel.tsx
 * fork: apps/web/src/components/signals/action-row/thread-read-card.tsx @ d2ef5f42
 *   why: live-state thread + accept/dismiss mutations
 * reuse: ActionRow, ActionButton, RichMarkdown
 * state: thread-surface thread read proposing a reply, draft open
 * marketing: inert — no handlers; Brain/Dismiss/Send are decorative
 */

import { ActionButton } from "@workspace/ui/components/button";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
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
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <RichMarkdown
                content={summary}
                preset="inline"
                className={
                  recommendation
                    ? "text-foreground-secondary"
                    : "text-foreground-primary"
                }
              />
              {recommendation ? (
                <RichMarkdown
                  content={recommendation}
                  preset="inline"
                  className="text-foreground-primary"
                />
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <ActionButton size="sm" variant="ghost" tabIndex={-1} aria-hidden>
                <Brain className="size-3.5" />
              </ActionButton>
              <ActionRow.Dismiss
                onClick={() => undefined}
                label="Dismiss read"
              />
            </div>
          </div>
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
          <div className="mr-auto">
            <ActionRow.Meta>just now</ActionRow.Meta>
          </div>
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
