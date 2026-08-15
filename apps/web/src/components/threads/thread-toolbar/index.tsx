import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { useNavigate } from "@tanstack/react-router";
import { fingerprintAgentRead } from "@workspace/schemas/signals";
import type { JSONContent } from "@workspace/ui/components/blocks/tiptap";
import { cn } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { AnimatePresence, motion } from "motion/react";
import { usePostHog } from "posthog-js/react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import type { ActorContext } from "~/components/signals/action-row";
import { mutate, query } from "~/lib/live-state";
import { buildThreadParam } from "~/utils/thread";

import { useQuickActionsSuggestions } from "./quick-actions";
import { ReplyEditor } from "./reply-editor";
import { SupportIntelligencePanel } from "./support-intelligence-panel";
import { ToolbarActions } from "./toolbar-actions";
import { useToolbarMode } from "./use-toolbar-mode";

interface ThreadToolbarProps {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: { id: string; label: { id: string } }[] | undefined;
  currentStatus: number;
  user: { id: string; name: string; image?: string | null };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>
  ) => void;
}

type ThreadRecord = InferLiveObject<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

function ToolbarPanel({
  open,
  width,
  className,
  children,
}: {
  open: boolean;
  width: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-slot="thread-toolbar-panel"
          initial={{ opacity: 0, scale: 0.9, width: 576 }}
          animate={{
            opacity: 1,
            scale: 1,
            width,
          }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
          className={cn("origin-bottom overflow-hidden", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const ThreadToolbar = ({
  threadId,
  organizationId,
  threadLabels,
  currentStatus,
  user,
  captureThreadEvent,
}: ThreadToolbarProps) => {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [replyDraft, setReplyDraft] = useState<JSONContent[]>([]);

  const suggestionsData = useQuickActionsSuggestions({
    currentStatus,
    organizationId,
    threadId,
    threadLabels,
  });

  const threadRows = useLiveQuery(
    query.thread.where({ id: threadId }).include({
      assignedUser: { include: { user: true } },
      author: { include: { user: true } },
    })
  );
  const thread = threadRows?.[0] as ThreadRecord | undefined;

  const agentRead = thread?.agentRead;
  const hasThreadRead = Boolean(agentRead);
  const readFingerprint = useMemo(
    () => (agentRead ? fingerprintAgentRead(agentRead) : null),
    [agentRead]
  );
  const labelKey = useMemo(
    () =>
      (suggestionsData.suggestedLabels ?? [])
        .map((label) => label.suggestionId)
        .toSorted()
        .join(","),
    [suggestionsData.suggestedLabels]
  );
  const hasLabelSuggestions = suggestionsData.hasLabelSuggestions;
  const hasSomethingToShow = hasThreadRead || hasLabelSuggestions;

  const { mode, toggleReply, toggleSupportIntelligence, exitReply } =
    useToolbarMode({
      hasSomethingToShow,
      labelKey,
      readFingerprint,
      ready: threadRows !== undefined,
    });

  const ctx: ActorContext | null =
    organizationId === undefined
      ? null
      : {
          organizationId,
          posthog: posthog ?? null,
          user: { id: user.id, name: user.name },
        };

  const threads = useLiveQuery(
    query.thread
      .where({
        deletedAt: null,
        organizationId,
      })
      .orderBy("createdAt", "desc")
  );

  const isResolved = currentStatus === 2;

  const handleResolve = () => {
    if (!organizationId) {
      return;
    }

    const newStatus = isResolved ? 0 : 2;
    mutate.thread.setStatus({
      organizationId,
      status: newStatus,
      threadId,
      userId: user.id,
      userName: user.name,
    });
    captureThreadEvent("thread:status_change", {
      newStatus,
      oldStatus: currentStatus,
    });
  };

  const handleNext = () => {
    if (!threads || threads.length === 0) {
      return;
    }

    const currentIndex = threads.findIndex((t) => t.id === threadId);
    const nextIndex = currentIndex + 1;

    if (nextIndex < threads.length && nextIndex) {
      navigate({
        params: { id: buildThreadParam(threads[nextIndex]) },
        to: "/app/threads/$id",
      });
    } else {
      toast("No more threads");
    }
  };

  const isPanelOpen = mode !== null;
  // Mirror SupportIntelligencePanel's own condition: without `ctx` it falls back
  // to quick actions or the empty state, which still need the panel chrome.
  const showsThreadRead = hasThreadRead && ctx !== null;
  const panelWidth =
    mode === "reply" || (mode === "support-intelligence" && showsThreadRead)
      ? 768
      : 576;
  const readCardIsPanel = mode === "support-intelligence" && showsThreadRead;

  return (
    <div
      data-slot="thread-toolbar"
      className="w-full flex flex-col gap-2.5 items-center"
    >
      <ToolbarPanel
        open={isPanelOpen}
        width={panelWidth}
        className={
          readCardIsPanel
            ? undefined
            : "bg-background-tertiary rounded-md border border-input"
        }
      >
        {mode === "support-intelligence" ? (
          <SupportIntelligencePanel
            thread={thread}
            ctx={ctx}
            hasLabelSuggestions={hasLabelSuggestions}
            suggestionsData={suggestionsData}
            threadId={threadId}
            organizationId={organizationId}
            threadLabels={threadLabels}
            currentStatus={currentStatus}
            user={user}
            onClose={toggleSupportIntelligence}
            captureThreadEvent={captureThreadEvent}
          />
        ) : null}
        {mode === "reply" ? (
          <ReplyEditor
            organizationId={organizationId}
            threadId={threadId}
            user={user}
            captureThreadEvent={captureThreadEvent}
            value={replyDraft}
            onValueChange={setReplyDraft}
            onSubmitted={() => {
              setReplyDraft([]);
              exitReply();
            }}
          />
        ) : null}
      </ToolbarPanel>
      <ToolbarActions
        mode={mode}
        isResolved={isResolved}
        onToggleReply={toggleReply}
        onToggleSupportIntelligence={toggleSupportIntelligence}
        onResolve={handleResolve}
        onNext={handleNext}
      />
    </div>
  );
};
