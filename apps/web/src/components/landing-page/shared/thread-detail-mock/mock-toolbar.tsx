/* mirror: thread toolbar — apps/web/src/components/threads/thread-toolbar/index.tsx
 * fork: apps/web/src/components/threads/thread-toolbar/index.tsx @ 59006b69
 *   why: live-state suggestions + panel mode state, mutate resolve, navigate next
 * reuse: ToolbarActions, MockSupportIntelligenceChat
 * state: from props — SI chat panel, or actions only
 * marketing: none — no AnimatePresence; panel always open when content present.
 *   Only the real toolbar's SI mode is mirrored; the reply-composer and
 *   suggestion panels are omitted because no mock opens them.
 */

import { ToolbarActions } from "~/components/threads/thread-toolbar/toolbar-actions";

import {
  MockSupportIntelligenceChat,
  type MockSiMessage,
} from "./mock-support-intelligence-chat";

const NOOP = () => {};

interface MockThreadToolbarProps {
  mode?: "support-intelligence" | null;
  /** Markdown draft for SI chat Draft Reply. */
  siDraft?: string;
  siMessages?: MockSiMessage[];
  isResolved?: boolean;
}

export function MockThreadToolbar({
  mode = null,
  siDraft,
  siMessages,
  isResolved = false,
}: MockThreadToolbarProps) {
  const hasSi = mode === "support-intelligence";

  return (
    <div
      data-slot="thread-toolbar"
      className="w-full flex flex-col gap-2.5 items-center"
    >
      {hasSi ? (
        <div
          data-slot="thread-toolbar-panel"
          className="origin-bottom bg-background-tertiary rounded-md border border-input overflow-hidden"
          style={{ width: 768 }}
        >
          <MockSupportIntelligenceChat draft={siDraft} messages={siMessages} />
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
