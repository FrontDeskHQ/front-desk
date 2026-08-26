/* mirror: thread toolbar — apps/web/src/components/threads/thread-toolbar/index.tsx
 * fork: apps/web/src/components/threads/thread-toolbar/index.tsx @ d2ef5f42
 *   why: live-state thread read + panel mode state, mutate resolve, navigate next
 * reuse: ToolbarActions, MockThreadReadPanel
 * state: from props — SI mode shows the thread-read mirror, or actions only
 * marketing: none — no AnimatePresence; panel always open when content present.
 */

import { ToolbarActions } from "~/components/threads/thread-toolbar/toolbar-actions";

import { MockThreadReadPanel } from "./mock-thread-read-panel";

const NOOP = () => {};

interface MockThreadToolbarProps {
  mode?: "support-intelligence" | null;
  summary?: string;
  recommendation?: string;
  draft?: string;
  isResolved?: boolean;
}

export function MockThreadToolbar({
  mode = null,
  summary,
  recommendation,
  draft,
  isResolved = false,
}: MockThreadToolbarProps) {
  const hasSi = mode === "support-intelligence";

  return (
    <div
      data-slot="thread-toolbar"
      className="w-full min-w-0 flex flex-col gap-2.5 items-center"
    >
      {hasSi && summary && draft ? (
        <div
          data-slot="thread-toolbar-panel"
          className="w-full min-w-0 max-w-3xl origin-bottom overflow-hidden"
        >
          <MockThreadReadPanel
            summary={summary}
            recommendation={recommendation}
            draft={draft}
          />
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
