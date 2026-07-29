/* mirror: thread toolbar — apps/web/src/components/threads/thread-toolbar/index.tsx
 * fork: apps/web/src/components/threads/thread-toolbar/index.tsx @ 59006b69
 *   why: live-state suggestions + reply/SI mode state, mutate resolve, navigate next
 * reuse: ToolbarActions, MockQuickActionsPanel, MockReplyEditor,
 *   MockSupportIntelligenceChat
 * state: from props — reply panel, SI chat, or suggestions-only
 * marketing: none — no AnimatePresence; panel always open when content present
 */

import { cn } from "@workspace/ui/lib/utils";

import { ToolbarActions } from "~/components/threads/thread-toolbar/toolbar-actions";

import { MockQuickActionsPanel } from "./mock-quick-actions";
import { MockReplyEditor } from "./mock-reply-editor";
import {
  MockSupportIntelligenceChat,
  type MockSiMessage,
} from "./mock-support-intelligence-chat";
import type { MockLabel, MockStatusSuggestion } from "./types";

const NOOP = () => {};

export interface MockToolbarSuggestions {
  suggestedLabels: MockLabel[];
  statusSuggestion: MockStatusSuggestion | null;
}

interface MockThreadToolbarProps {
  mode?: "reply" | "support-intelligence" | null;
  /** TipTap JSON string for reply mode composer. */
  replyDraft?: string;
  /** Markdown draft for SI chat Draft Reply. */
  siDraft?: string;
  siMessages?: MockSiMessage[];
  suggestions?: MockToolbarSuggestions;
  isResolved?: boolean;
}

export function MockThreadToolbar({
  mode = null,
  replyDraft,
  siDraft,
  siMessages,
  suggestions,
  isResolved = false,
}: MockThreadToolbarProps) {
  const hasSuggestions =
    mode !== "support-intelligence" &&
    ((suggestions?.suggestedLabels.length ?? 0) > 0 ||
      suggestions?.statusSuggestion != null);
  const hasReply = mode === "reply" && Boolean(replyDraft && replyDraft.length > 0);
  const hasSi = mode === "support-intelligence";
  const isPanelOpen = hasSuggestions || hasReply || hasSi;
  const widePanel = hasReply || hasSi;

  return (
    <div
      data-slot="thread-toolbar"
      className="w-full flex flex-col gap-2.5 items-center"
    >
      {isPanelOpen ? (
        <div
          data-slot="thread-toolbar-panel"
          className="origin-bottom bg-background-tertiary rounded-md border border-input overflow-hidden"
          style={{ width: widePanel ? 768 : 576 }}
        >
          {hasSuggestions && suggestions ? (
            <MockQuickActionsPanel
              suggestedLabels={suggestions.suggestedLabels}
              statusSuggestion={suggestions.statusSuggestion}
              showClose={hasReply}
            />
          ) : null}
          {hasReply && replyDraft ? (
            <div
              className={cn(
                "overflow-hidden bg-background-tertiary",
                hasSuggestions && "border-t border-input rounded-t-none"
              )}
            >
              <MockReplyEditor
                draft={replyDraft}
                className={cn(hasSuggestions && "rounded-t-none!")}
              />
            </div>
          ) : null}
          {hasSi ? (
            <MockSupportIntelligenceChat
              draft={siDraft}
              messages={siMessages}
            />
          ) : null}
        </div>
      ) : null}
      <ToolbarActions
        mode={mode}
        isResolved={isResolved}
        onToggleReply={NOOP}
        onToggleSupportIntelligence={NOOP}
        onResolve={NOOP}
        onNext={NOOP}
      />
    </div>
  );
}
