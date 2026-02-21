import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { QuickActionsPanel, useQuickActionsSuggestions } from "./quick-actions";
import { ReplyEditor } from "./reply-editor";
import { ToolbarActions } from "./toolbar-actions";

type ThreadToolbarProps = {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  currentStatus: number;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
};

export const ThreadToolbar = ({
  threadId,
  organizationId,
  threadLabels,
  currentStatus,
  user,
  captureThreadEvent,
}: ThreadToolbarProps) => {
  const [mode, setMode] = useState<"reply" | "support-intelligence" | null>(
    null,
  );

  const suggestionsData = useQuickActionsSuggestions({
    threadId,
    organizationId,
    threadLabels,
    currentStatus,
  });

  const handleToggleReply = () => {
    setMode((prev) => (prev === "reply" ? null : "reply"));
  };

  const handleClose = () => {
    setMode(null);
  };

  const isPanelOpen = suggestionsData.hasSuggestions || mode === "reply";

  return (
    <div data-slot="thread-toolbar" className="w-full flex flex-col gap-2.5">
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            data-slot="thread-toolbar-panel"
            className="flex flex-col bg-background-tertiary rounded-md border border-input origin-bottom overflow-hidden"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{
              type: "tween",
              duration: 0.15,
              ease: "easeOut",
              layout: {
                type: "tween",
                duration: 0.15,
                ease: "easeInOut",
              },
            }}
            layout
          >
            <QuickActionsPanel
              threadId={threadId}
              organizationId={organizationId}
              threadLabels={threadLabels}
              currentStatus={currentStatus}
              user={user}
              captureThreadEvent={captureThreadEvent}
              showClose={mode === "reply"}
              onClose={handleClose}
              suggestionsData={suggestionsData}
            />
            {mode === "reply" && (
              <ReplyEditor
                organizationId={organizationId}
                threadId={threadId}
                user={user}
                captureThreadEvent={captureThreadEvent}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <ToolbarActions mode={mode} onToggleReply={handleToggleReply} />
    </div>
  );
};
