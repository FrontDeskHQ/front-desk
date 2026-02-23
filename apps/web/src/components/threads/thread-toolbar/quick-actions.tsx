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
import { ulid } from "ulid";
import { BaseThreadChip } from "~/components/chips";
import {
  usePendingDuplicateSuggestions,
  usePendingLabelSuggestions,
  usePendingStatusSuggestions,
} from "~/components/threads/thread-input-area-deprecated/support-intelligence";
import { mutate, query } from "~/lib/live-state";

type UseQuickActionsSuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  currentStatus: number;
};

export const useQuickActionsSuggestions = ({
  threadId,
  organizationId,
  threadLabels,
  currentStatus,
}: UseQuickActionsSuggestionsProps) => {
  const { suggestedLabels, suggestions } = usePendingLabelSuggestions({
    threadId,
    organizationId,
    threadLabels,
  });

  const { statusSuggestion } = usePendingStatusSuggestions({
    threadId,
    organizationId,
    currentStatus,
  });

  const { duplicateSuggestion } = usePendingDuplicateSuggestions({
    threadId,
    organizationId,
  });

  const hasLabelSuggestions = (suggestedLabels?.length ?? 0) > 0;
  const hasStatusSuggestion = statusSuggestion !== null;
  const hasDuplicateSuggestion =
    duplicateSuggestion !== null && duplicateSuggestion.thread !== null;
  const hasSuggestions =
    hasLabelSuggestions || hasStatusSuggestion || hasDuplicateSuggestion;

  return {
    suggestedLabels,
    suggestions,
    statusSuggestion,
    duplicateSuggestion,
    hasLabelSuggestions,
    hasStatusSuggestion,
    hasDuplicateSuggestion,
    hasSuggestions,
  };
};

export type QuickActionsSuggestionsData = ReturnType<
  typeof useQuickActionsSuggestions
>;

type QuickActionsPanelProps = {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  currentStatus: number;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
  showClose: boolean;
  onClose: () => void;
  suggestionsData: QuickActionsSuggestionsData;
};

const getSuggestionReasoning = (metadataStr: string | null): string | null => {
  if (!metadataStr) return null;
  try {
    const metadata = JSON.parse(metadataStr) as { reasoning?: string };
    return metadata.reasoning ?? null;
  } catch {
    return null;
  }
};

type HoverCardPayload = {
  element: React.ReactNode;
  subtitle: string;
  reasoning: string | null;
  handleAccept: () => void;
};

const hoverCardHandle = createHoverCardHandle<HoverCardPayload>();

export const QuickActionsPanel = ({
  threadId,
  organizationId,
  threadLabels,
  currentStatus,
  user,
  captureThreadEvent,
  showClose,
  onClose,
  suggestionsData,
}: QuickActionsPanelProps) => {
  const {
    suggestedLabels,
    suggestions,
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
    [matches],
  );

  useEffect(() => {
    if (!hoverCardOpen) return;
    setHoverCardOpen(false);
  }, [matchKey]);

  useEffect(() => {
    if (hasSuggestions && !previousHasSuggestionsRef.current) {
      captureThreadEvent("support_intelligence:suggestions_shown", {
        label_suggestion_count: suggestedLabels?.length ?? 0,
        has_status_suggestion: hasStatusSuggestion,
        has_duplicate_suggestion: hasDuplicateSuggestion,
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
        : "support_intelligence:suggestions_expanded",
    );
    setIsCollapsed(newState);
  };

  const updateSuggestionForLabel = (labelId: string, accepted: boolean) => {
    if (!organizationId || !suggestions) return;

    const suggestion = suggestions.find((s) => s.relatedEntityId === labelId);
    if (!suggestion) return;

    mutate.suggestion.update(suggestion.id, {
      accepted,
      active: false,
      updatedAt: new Date(),
    });
  };

  const handleAcceptLabel = (labelId: string) => {
    const label = suggestedLabels?.find((l) => l.id === labelId);

    const existingThreadLabel = threadLabels?.find(
      (tl) => tl.label.id === labelId,
    );

    if (existingThreadLabel) {
      mutate.threadLabel.update(existingThreadLabel.id, { enabled: true });
    } else {
      mutate.threadLabel.insert({
        id: ulid().toLowerCase(),
        threadId: threadId,
        labelId: labelId,
        enabled: true,
      });
    }

    updateSuggestionForLabel(labelId, true);

    captureThreadEvent("support_intelligence:label_accepted", {
      label_id: labelId,
      label_name: label?.name,
    });
  };

  const handleAcceptAllLabels = () => {
    const labelIds = suggestedLabels?.map((l) => l.id) ?? [];

    for (const label of suggestedLabels ?? []) {
      const labelId = label.id;

      const existingThreadLabel = threadLabels?.find(
        (tl) => tl.label.id === labelId,
      );

      if (existingThreadLabel) {
        mutate.threadLabel.update(existingThreadLabel.id, { enabled: true });
      } else {
        mutate.threadLabel.insert({
          id: ulid().toLowerCase(),
          threadId: threadId,
          labelId: labelId,
          enabled: true,
        });
      }

      updateSuggestionForLabel(labelId, true);
    }

    captureThreadEvent("support_intelligence:all_labels_accepted", {
      label_count: labelIds.length,
    });
  };

  const handleDismissAllLabels = () => {
    const labelIds = suggestedLabels?.map((l) => l.id) ?? [];

    for (const labelId of labelIds) {
      updateSuggestionForLabel(labelId, false);
    }

    captureThreadEvent("support_intelligence:all_labels_dismissed", {
      label_count: labelIds.length,
    });
  };

  const handleAcceptStatus = () => {
    if (!statusSuggestion || !organizationId) return;

    const oldStatus = currentStatus;
    const newStatus = statusSuggestion.suggestedStatus;
    const oldStatusLabel = statusValues[oldStatus]?.label ?? "Unknown";
    const newStatusLabel = statusSuggestion.label;

    mutate.thread.update(threadId, {
      status: newStatus,
    });

    mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId,
      type: "status_changed",
      createdAt: new Date(),
      userId: user.id,
      metadataStr: JSON.stringify({
        oldStatus,
        newStatus,
        oldStatusLabel,
        newStatusLabel,
        userName: user.name,
        source: "support_intelligence",
      }),
      replicatedStr: JSON.stringify({}),
    });

    mutate.suggestion.update(statusSuggestion.suggestion.id, {
      accepted: true,
      active: false,
      updatedAt: new Date(),
    });

    captureThreadEvent("support_intelligence:status_accepted", {
      old_status: oldStatus,
      new_status: newStatus,
      old_status_label: oldStatusLabel,
      new_status_label: newStatusLabel,
    });
  };

  const handleDismissStatus = () => {
    if (!statusSuggestion) return;

    mutate.suggestion.update(statusSuggestion.suggestion.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });

    captureThreadEvent("support_intelligence:status_dismissed", {
      suggested_status: statusSuggestion.suggestedStatus,
      suggested_status_label: statusSuggestion.label,
    });
  };

  const handleAcceptDuplicate = () => {
    if (!duplicateSuggestion || !organizationId) return;

    mutate.suggestion.update(duplicateSuggestion.suggestion.id, {
      accepted: true,
      active: false,
      updatedAt: new Date(),
    });

    mutate.thread.update(threadId, { status: 4 });

    mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId,
      type: "marked_duplicate",
      createdAt: new Date(),
      userId: user.id,
      metadataStr: JSON.stringify({
        duplicateOfThreadId: duplicateSuggestion.duplicateThreadId,
        duplicateOfThreadName: duplicateSuggestion.thread?.name,
        userName: user.name,
        source: "support_intelligence",
      }),
      replicatedStr: JSON.stringify({}),
    });

    captureThreadEvent("support_intelligence:duplicate_accepted", {
      duplicate_thread_id: duplicateSuggestion.duplicateThreadId,
      confidence: duplicateSuggestion.confidence,
    });
  };

  const handleDismissDuplicate = () => {
    if (!duplicateSuggestion) return;

    mutate.suggestion.update(duplicateSuggestion.suggestion.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });

    captureThreadEvent("support_intelligence:duplicate_dismissed", {
      duplicate_thread_id: duplicateSuggestion.duplicateThreadId,
      confidence: duplicateSuggestion.confidence,
    });
  };

  const handleAcceptAll = () => {
    if (hasStatusSuggestion) handleAcceptStatus();
    if (hasLabelSuggestions) handleAcceptAllLabels();
    if (hasDuplicateSuggestion) handleAcceptDuplicate();
  };

  const handleDismissAll = () => {
    if (hasStatusSuggestion) handleDismissStatus();
    if (hasLabelSuggestions) handleDismissAllLabels();
    if (hasDuplicateSuggestion) handleDismissDuplicate();
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
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
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
              type: "tween",
              duration: 0.2,
              ease: "easeInOut",
            }}
          >
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mt-2 items-center">
              {hasStatusOrLabelSuggestions && (
                <>
                  <div className="text-foreground-secondary">Suggestions</div>
                  <div className="flex gap-2 items-center flex-wrap group">
                    {statusSuggestion &&
                      (() => {
                        const reasoning = getSuggestionReasoning(
                          statusSuggestion.suggestion.metadataStr,
                        );
                        return (
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
                              subtitle: "Suggested status",
                              element: (
                                <div className="border border-dashed flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs bg-foreground-tertiary/15">
                                  <StatusIndicator
                                    status={statusSuggestion.suggestedStatus}
                                  />
                                  {statusSuggestion.label}
                                </div>
                              ),
                              reasoning: reasoning,
                              handleAccept: handleAcceptStatus,
                            }}
                          >
                            <StatusIndicator
                              status={statusSuggestion.suggestedStatus}
                            />
                            {statusSuggestion.label}
                          </HoverCardTrigger>
                        );
                      })()}
                    {suggestedLabels?.map((label) => {
                      return (
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
                      );
                    })}

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
                        <BaseThreadChip
                          thread={duplicateSuggestion.thread}
                          className="border-dashed bg-transparent border-input dark:hover:bg-foreground-tertiary/15"
                          onClick={handleAcceptDuplicate}
                        />
                      }
                      handle={hoverCardHandle}
                      payload={{
                        subtitle: "Possible duplicate",
                        element: (
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                              <Link
                                to="/app/threads/$id"
                                params={{ id: duplicateSuggestion.thread.id }}
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
                                          .createdAt as Date,
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
                        reasoning: duplicateSuggestion.reason,
                        handleAccept: handleAcceptDuplicate,
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
