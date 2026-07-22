import { Link, useMatches } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import {
  createHoverCardHandle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import {
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
  statusValues,
} from "@workspace/ui/components/indicator";
import { Separator } from "@workspace/ui/components/separator";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { Check, ChevronDown, CircleUser, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ThreadChip } from "~/components/chips";
import {
  usePendingDuplicateSuggestions,
  usePendingLabelSuggestions,
  usePendingStatusSuggestions,
} from "~/components/threads/thread-toolbar/support-intelligence";
import { mutate } from "~/lib/live-state";
import { buildThreadParam } from "~/utils/thread";

interface UseQuickActionsSuggestionsProps {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: { id: string; label: { id: string } }[] | undefined;
  currentStatus: number;
}

export const useQuickActionsSuggestions = ({
  threadId,
  organizationId,
  threadLabels,
  currentStatus,
}: UseQuickActionsSuggestionsProps) => {
  const { suggestedLabels } = usePendingLabelSuggestions({
    organizationId,
    threadId,
    threadLabels,
  });

  const { statusSuggestion } = usePendingStatusSuggestions({
    currentStatus,
    organizationId,
    threadId,
  });

  const { duplicateSuggestion } = usePendingDuplicateSuggestions({
    organizationId,
    threadId,
  });

  const hasLabelSuggestions = (suggestedLabels?.length ?? 0) > 0;
  const hasStatusSuggestion = statusSuggestion !== null;
  const hasDuplicateSuggestion =
    duplicateSuggestion !== null && duplicateSuggestion.thread !== null;
  const hasSuggestions =
    hasLabelSuggestions || hasStatusSuggestion || hasDuplicateSuggestion;

  return {
    duplicateSuggestion,
    hasDuplicateSuggestion,
    hasLabelSuggestions,
    hasStatusSuggestion,
    hasSuggestions,
    statusSuggestion,
    suggestedLabels,
  };
};

export type QuickActionsSuggestionsData = ReturnType<
  typeof useQuickActionsSuggestions
>;

interface QuickActionsPanelProps {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: { id: string; label: { id: string } }[] | undefined;
  currentStatus: number;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>
  ) => void;
  showClose: boolean;
  onClose: () => void;
  suggestionsData: QuickActionsSuggestionsData;
}

interface HoverCardPayload {
  element: React.ReactNode;
  subtitle: string;
  reasoning: string | null;
  handleAccept: () => void;
}

const hoverCardHandle = createHoverCardHandle<HoverCardPayload>();

export const QuickActionsPanel = ({
  threadId,
  organizationId,
  threadLabels: _threadLabels,
  currentStatus,
  user,
  captureThreadEvent,
  showClose,
  onClose,
  suggestionsData,
}: QuickActionsPanelProps) => {
  const {
    suggestedLabels,
    statusSuggestion,
    duplicateSuggestion,
    hasLabelSuggestions,
    hasStatusSuggestion,
    hasDuplicateSuggestion,
    hasSuggestions,
  } = suggestionsData;

  const hasStatusOrLabelSuggestions =
    hasLabelSuggestions || hasStatusSuggestion;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoverCardOpen, setHoverCardOpen] = useState(false);
  const previousHasSuggestionsRef = useRef(false);
  const matches = useMatches();
  const matchKey = useMemo(
    () => matches.map((match) => match.id).join("|"),
    [matches]
  );

  const hoverCardOpenRef = useRef(hoverCardOpen);
  hoverCardOpenRef.current = hoverCardOpen;

  useEffect(() => {
    if (!hoverCardOpenRef.current) {
      return;
    }
    setHoverCardOpen(false);
  }, [matchKey]);

  useEffect(() => {
    if (hasSuggestions && !previousHasSuggestionsRef.current) {
      captureThreadEvent("support_intelligence:suggestions_shown", {
        has_duplicate_suggestion: hasDuplicateSuggestion,
        has_status_suggestion: hasStatusSuggestion,
        label_suggestion_count: suggestedLabels?.length ?? 0,
      });
    }
    previousHasSuggestionsRef.current = hasSuggestions;
  }, [
    hasSuggestions,
    suggestedLabels?.length,
    hasStatusSuggestion,
    hasDuplicateSuggestion,
    captureThreadEvent,
  ]);

  const handleToggleCollapse = () => {
    const newState = !isCollapsed;
    captureThreadEvent(
      newState
        ? "support_intelligence:suggestions_collapsed"
        : "support_intelligence:suggestions_expanded"
    );
    setIsCollapsed(newState);
  };

  // Accepting an inline suggestion executes its action (attach label / set
  // status) and removes it from thread.inlineSuggestions server-side; dismissing
  // just removes it. Both are no-ops without an organization scope.
  const acceptSuggestion = async (suggestionId: string) => {
    if (!organizationId) {
      return;
    }
    await mutate.thread.acceptInlineSuggestion({
      organizationId,
      suggestionId,
      threadId,
    });
  };

  const dismissSuggestion = async (suggestionId: string) => {
    if (!organizationId) {
      return;
    }
    await mutate.thread.dismissInlineSuggestion({
      organizationId,
      suggestionId,
      threadId,
    });
  };

  const handleAcceptLabel = (labelId: string) => {
    const label = suggestedLabels?.find((l) => l.id === labelId);
    if (!label) {
      return;
    }

    acceptSuggestion(label.suggestionId);

    captureThreadEvent("support_intelligence:label_accepted", {
      label_id: labelId,
      label_name: label.name,
    });
  };

  // Accept/dismiss the batch serially so this loop doesn't pile redundant
  // requests against the same thread. The server-side removal is transactional,
  // so cross-tab concurrency is already safe; awaiting here just avoids
  // self-inflicted contention.
  const handleAcceptAllLabels = async () => {
    const labels = suggestedLabels ?? [];

    for (const label of labels) {
      await acceptSuggestion(label.suggestionId);
    }

    captureThreadEvent("support_intelligence:all_labels_accepted", {
      label_count: labels.length,
    });
  };

  const handleDismissAllLabels = async () => {
    const labels = suggestedLabels ?? [];

    for (const label of labels) {
      await dismissSuggestion(label.suggestionId);
    }

    captureThreadEvent("support_intelligence:all_labels_dismissed", {
      label_count: labels.length,
    });
  };

  const handleAcceptStatus = async () => {
    if (!statusSuggestion) {
      return;
    }

    const oldStatus = currentStatus;
    const newStatus = statusSuggestion.suggestedStatus;
    const oldStatusLabel = statusValues[oldStatus]?.label ?? "Unknown";
    const newStatusLabel = statusSuggestion.label;

    await acceptSuggestion(statusSuggestion.suggestionId);

    captureThreadEvent("support_intelligence:status_accepted", {
      new_status: newStatus,
      new_status_label: newStatusLabel,
      old_status: oldStatus,
      old_status_label: oldStatusLabel,
    });
  };

  const handleDismissStatus = async () => {
    if (!statusSuggestion) {
      return;
    }

    await dismissSuggestion(statusSuggestion.suggestionId);

    captureThreadEvent("support_intelligence:status_dismissed", {
      suggested_status: statusSuggestion.suggestedStatus,
      suggested_status_label: statusSuggestion.label,
    });
  };

  const handleAcceptDuplicate = () => {
    if (!duplicateSuggestion || !organizationId) {
      return;
    }

    // TODO(signals-overhaul issue 10): record acceptance on inlineSuggestions
    // (duplicate handling will move into the synthesis-track in issue 06).
    mutate.thread.markDuplicate({
      duplicateOfThreadId: duplicateSuggestion.duplicateThreadId,
      duplicateOfThreadName: duplicateSuggestion.thread?.name,
      organizationId,
      source: "support_intelligence",
      threadId,
      userId: user.id,
      userName: user.name,
    });

    captureThreadEvent("support_intelligence:duplicate_accepted", {
      confidence: duplicateSuggestion.confidence,
      duplicate_thread_id: duplicateSuggestion.duplicateThreadId,
    });
  };

  const handleDismissDuplicate = () => {
    if (!duplicateSuggestion) {
      return;
    }

    // TODO(signals-overhaul issue 10): record dismissal on inlineSuggestions.
    captureThreadEvent("support_intelligence:duplicate_dismissed", {
      confidence: duplicateSuggestion.confidence,
      duplicate_thread_id: duplicateSuggestion.duplicateThreadId,
    });
  };

  const handleAcceptAll = async () => {
    if (hasStatusSuggestion) {
      await handleAcceptStatus();
    }
    if (hasLabelSuggestions) {
      await handleAcceptAllLabels();
    }
    if (hasDuplicateSuggestion) {
      handleAcceptDuplicate();
    }
  };

  const handleDismissAll = async () => {
    if (hasStatusSuggestion) {
      await handleDismissStatus();
    }
    if (hasLabelSuggestions) {
      await handleDismissAllLabels();
    }
    if (hasDuplicateSuggestion) {
      handleDismissDuplicate();
    }
  };

  return (
    <div data-slot="quick-actions-panel" className="px-4 py-4">
      <div className="flex gap-4 items-center">
        <Zap className="size-3.5 stroke-2" />
        <div className="flex-1">Support Intelligence</div>
        <motion.div className="flex items-center gap-0" layout>
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip={isCollapsed ? "Expand" : "Collapse"}
            className="text-foreground-secondary"
            onClick={handleToggleCollapse}
          >
            <ChevronDown
              className={`text-foreground-secondary pointer-events-none size-4 shrink-0 transition-transform duration-200 ${
                isCollapsed ? "" : "rotate-180"
              }`}
            />
          </ActionButton>
          <AnimatePresence initial={false}>
            {showClose && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <ActionButton
                  variant="ghost"
                  size="icon-sm"
                  tooltip="Close"
                  className="text-foreground-secondary"
                  onClick={onClose}
                >
                  <X className="size-4" />
                </ActionButton>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            className="overflow-hidden text-sm"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.2,
              ease: "easeInOut",
              type: "tween",
            }}
          >
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mt-2 items-center">
              {hasStatusOrLabelSuggestions && (
                <>
                  <div className="text-foreground-secondary">Suggestions</div>
                  <div className="flex gap-2 items-center flex-wrap group">
                    {statusSuggestion && (
                      <HoverCardTrigger
                        render={
                          <ActionButton
                            variant="ghost"
                            size="sm"
                            className="border border-dashed border-input dark:hover:bg-foreground-tertiary/15"
                            onClick={handleAcceptStatus}
                          />
                        }
                        handle={hoverCardHandle}
                        payload={{
                          element: (
                            <div className="border border-dashed flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs bg-foreground-tertiary/15">
                              <StatusIndicator
                                status={statusSuggestion.suggestedStatus}
                              />
                              {statusSuggestion.label}
                            </div>
                          ),
                          handleAccept: handleAcceptStatus,
                          reasoning: null,
                          subtitle: "Suggested status",
                        }}
                      >
                        <StatusIndicator
                          status={statusSuggestion.suggestedStatus}
                        />
                        {statusSuggestion.label}
                      </HoverCardTrigger>
                    )}
                    {suggestedLabels?.map((label) => (
                      <HoverCardTrigger
                        key={label.id}
                        render={
                          <ActionButton
                            variant="ghost"
                            size="sm"
                            className="border border-dashed border-input dark:hover:bg-foreground-tertiary/15"
                            onClick={() => handleAcceptLabel(label.id)}
                          />
                        }
                        handle={hoverCardHandle}
                        payload={{
                          subtitle: "Suggested label",
                          element: (
                            <div className="border border-dashed flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs bg-foreground-tertiary/15">
                              <div
                                className="size-2 rounded-full"
                                style={{ backgroundColor: label.color }}
                              />
                              {label.name}
                            </div>
                          ),
                          handleAccept: () => handleAcceptLabel(label.id),
                        }}
                      >
                        <div
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor: label.color,
                          }}
                        />
                        {label.name}
                      </HoverCardTrigger>
                    ))}

                    <div className="flex items-center gap-0 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
                      <ActionButton
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Accept all"
                        className="text-foreground-secondary"
                        onClick={handleAcceptAll}
                      >
                        <Check />
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Ignore all"
                        className="text-foreground-secondary"
                        onClick={handleDismissAll}
                      >
                        <X />
                      </ActionButton>
                    </div>
                  </div>
                </>
              )}

              {hasDuplicateSuggestion && duplicateSuggestion?.thread && (
                <>
                  <div className="text-foreground-secondary">Duplicate of</div>
                  <div className="flex gap-2 items-center flex-wrap group">
                    <HoverCardTrigger
                      render={
                        <ThreadChip
                          thread={duplicateSuggestion.thread}
                          className="border-dashed bg-transparent border-input dark:hover:bg-foreground-tertiary/15"
                          onClick={handleAcceptDuplicate}
                        />
                      }
                      handle={hoverCardHandle}
                      payload={{
                        element: (
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                              <Link
                                to="/app/threads/$id"
                                params={{
                                  id: buildThreadParam(
                                    duplicateSuggestion.thread
                                  ),
                                }}
                                className="text-sm font-medium text-foreground hover:underline"
                              >
                                {duplicateSuggestion.thread.name}
                              </Link>
                              <div className="flex items-center gap-2">
                                <Avatar
                                  variant="user"
                                  size="sm"
                                  fallback={
                                    duplicateSuggestion.thread.author?.name
                                  }
                                  src={
                                    duplicateSuggestion.thread.author?.user
                                      ?.image ?? undefined
                                  }
                                />
                                <span className="text-sm">
                                  {duplicateSuggestion.thread.author?.name}
                                </span>
                                <div className="ml-2 text-xs text-foreground-secondary">
                                  {duplicateSuggestion.thread.createdAt
                                    ? formatRelativeTime(
                                        duplicateSuggestion.thread
                                          .createdAt as Date
                                      )
                                    : "Unknown date"}
                                </div>
                              </div>
                            </div>
                            <Separator />
                            <div className="flex gap-3">
                              <div className="flex flex-col gap-1">
                                <div className="text-xs text-foreground-secondary">
                                  Status
                                </div>
                                <div className="flex items-center gap-2">
                                  <StatusIndicator
                                    status={
                                      duplicateSuggestion.thread.status ?? 0
                                    }
                                  />
                                  <span className="text-sm">
                                    <StatusText
                                      status={
                                        duplicateSuggestion.thread.status ?? 0
                                      }
                                    />
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="text-xs text-foreground-secondary">
                                  Priority
                                </div>
                                <div className="flex items-center gap-2">
                                  <PriorityIndicator
                                    priority={
                                      duplicateSuggestion.thread.priority ?? 0
                                    }
                                  />
                                  <span className="text-sm">
                                    <PriorityText
                                      priority={
                                        duplicateSuggestion.thread.priority ?? 0
                                      }
                                    />
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="text-xs text-foreground-secondary">
                                  Assignee
                                </div>
                                <div className="flex items-center gap-2">
                                  {duplicateSuggestion.thread.assignedUserId &&
                                  duplicateSuggestion.thread.assignedUser
                                    ?.name ? (
                                    <>
                                      <Avatar
                                        variant="user"
                                        size="sm"
                                        fallback={
                                          duplicateSuggestion.thread
                                            .assignedUser?.name
                                        }
                                        src={
                                          duplicateSuggestion.thread
                                            .assignedUser?.image ?? undefined
                                        }
                                      />
                                      <span className="text-sm">
                                        {
                                          duplicateSuggestion.thread
                                            .assignedUser?.name
                                        }
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <CircleUser className="size-4 text-foreground-secondary" />
                                      <span>Unassigned</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ),
                        handleAccept: handleAcceptDuplicate,
                        reasoning: duplicateSuggestion.reason,
                        subtitle: "Possible duplicate",
                      }}
                    />
                    <div className="flex gap-2">
                      <ActionButton
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Accept"
                        className="text-foreground-secondary opacity-0 group-hover:opacity-100 transition-opacity group-hover:duration-0"
                        onClick={handleAcceptDuplicate}
                      >
                        <Check />
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Ignore"
                        className="text-foreground-secondary opacity-0 group-hover:opacity-100 transition-opacity group-hover:duration-0"
                        onClick={handleDismissDuplicate}
                      >
                        <X />
                      </ActionButton>
                    </div>
                  </div>
                </>
              )}

              <HoverCard
                handle={hoverCardHandle}
                open={hoverCardOpen && hasSuggestions}
                onOpenChange={setHoverCardOpen}
              >
                {({ payload }) => (
                  <HoverCardContent className="min-w-76 w-full max-w-96 flex flex-col gap-3">
                    <div className="text-xs flex flex-col gap-1">
                      <div>{payload?.subtitle}</div>
                      {payload?.element}
                    </div>
                    <Separator />
                    {payload?.reasoning && (
                      <>
                        <div className="text-xs flex flex-col gap-1">
                          <div>Why this was suggested?</div>
                          <div className="text-foreground-secondary">
                            {payload.reasoning}
                          </div>
                        </div>
                        <Separator />
                      </>
                    )}
                    <ActionButton
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setHoverCardOpen(false);
                        payload?.handleAccept();
                      }}
                      className="w-full"
                    >
                      Apply suggestion
                    </ActionButton>
                  </HoverCardContent>
                )}
              </HoverCard>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
