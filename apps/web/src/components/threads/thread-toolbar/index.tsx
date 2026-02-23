import { useLiveQuery } from "@live-state/sync/client";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { updateThreadStatus } from "~/actions/threads";
import { query } from "~/lib/live-state";
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
  const navigate = useNavigate();
  const [mode, setMode] = useState<"reply" | "support-intelligence" | null>(
    null,
  );

  const suggestionsData = useQuickActionsSuggestions({
    threadId,
    organizationId,
    threadLabels,
    currentStatus,
  });

  const threads = useLiveQuery(
    query.thread
      .where({
        organizationId,
        deletedAt: null,
      })
      .orderBy("createdAt", "desc"),
  );

  const handleToggleReply = () => {
    setMode((prev) => (prev === "reply" ? null : "reply"));
  };

  const handleClose = () => {
    setMode(null);
  };

  const isResolved = currentStatus === 2;

  const handleResolve = async () => {
    const newStatus = isResolved ? 0 : 2;
    await updateThreadStatus({
      threadId,
      newStatus,
      oldStatus: currentStatus,
      userId: user.id,
      userName: user.name,
    });
    captureThreadEvent("thread:status_change", {
      oldStatus: currentStatus,
      newStatus,
    });
  };

  const handleNext = () => {
    if (!threads || threads.length === 0) return;

    const currentIndex = threads.findIndex((t) => t.id === threadId);
    const nextIndex = currentIndex + 1;

    if (nextIndex < threads.length && nextIndex) {
      navigate({
        to: "/app/threads/$id",
        params: { id: threads[nextIndex].id },
      });
    } else {
      toast("No more threads");
    }
  };

  const isPanelOpen = suggestionsData.hasSuggestions || mode === "reply";

  return (
    <div
      data-slot="thread-toolbar"
      className="w-full flex flex-col gap-2.5 items-center"
    >
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            data-slot="thread-toolbar-panel"
            initial={{ width: 576, scale: 0.9, opacity: 0 }}
            animate={{
              width: mode === "reply" ? 768 : 576,
              scale: 1,
              opacity: 1,
            }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="origin-bottom bg-background-tertiary rounded-md border border-input overflow-hidden"
          >
            {(!mode || suggestionsData.hasSuggestions) && (
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
            )}
            <AnimatePresence initial={false}>
              {mode === "reply" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeInOut" }}
                  className={cn(
                    "overflow-hidden bg-background-tertiary",
                    suggestionsData.hasSuggestions &&
                      "border-t border-input rounded-t-none",
                  )}
                >
                  <ReplyEditor
                    organizationId={organizationId}
                    threadId={threadId}
                    user={user}
                    captureThreadEvent={captureThreadEvent}
                    className={cn(
                      suggestionsData.hasSuggestions && "rounded-t-none!",
                    )}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      <ToolbarActions
        mode={mode}
        isResolved={isResolved}
        onToggleReply={handleToggleReply}
        onResolve={handleResolve}
        onNext={handleNext}
      />
    </div>
  );
};
