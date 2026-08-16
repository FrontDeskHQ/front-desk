/* mirror: thread-toolbar SI panel — apps/web/src/components/threads/thread-toolbar/support-intelligence-panel.tsx
 * fork: apps/web/src/components/signals/action-row/thread-read/thread-surface.tsx @ 847d3036
 *   why: live-state thread + accept/dismiss mutations
 * reuse: ActionRow, ActionButton, RichMarkdown, ThreadRead.SurfaceHeader,
 *   ReplyDraftChrome
 * state: thread-surface thread read proposing a reply, draft open
 * marketing: inert — no handlers; Brain/Dismiss/Send are decorative
 */

import { ActionButton } from "@workspace/ui/components/button";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { Brain } from "lucide-react";

import { RichMarkdown } from "~/components/markdown/rich-markdown";
import { ActionRow, ThreadRead } from "~/components/signals/action-row";
import { ReplyDraftChrome } from "~/components/signals/action-row/signal-reply-draft-editor";

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
          <ThreadRead.SurfaceHeader
            trailing={
              <>
                <ActionButton
                  size="sm"
                  variant="ghost"
                  tabIndex={-1}
                  aria-hidden
                >
                  <Brain className="size-3.5" />
                </ActionButton>
                <ActionRow.Dismiss onClick={() => undefined} label="Close" />
              </>
            }
          >
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
          </ThreadRead.SurfaceHeader>
        </ActionRow.Header>
        <ReplyDraftChrome>
          <div className="max-h-52 min-h-0 overflow-y-auto text-sm pb-2">
            <RichMarkdown content={draft} />
          </div>
        </ReplyDraftChrome>
        <ActionRow.Actions>
          <div className="mr-auto">
            <ActionRow.Meta>just now</ActionRow.Meta>
          </div>
          <ActionButton size="sm" variant="ghost" tabIndex={-1}>
            Dismiss
          </ActionButton>
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
