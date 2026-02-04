import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
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
import type { schema } from "api/schema";
import { Check, ChevronDown, CircleUser, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ulid } from "ulid";
import { BaseThreadChip } from "~/components/chips";
import { mutate, query } from "~/lib/live-state";

type SuggestionRow = {
  id: string;
  relatedEntityId: string | null;
  active: boolean;
  accepted: boolean;
  resultsStr: string | null;
  metadataStr: string | null;
};

type UsePendingLabelSuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
};

export const usePendingLabelSuggestions = ({
  threadId,
  organizationId,
  threadLabels,
}: UsePendingLabelSuggestionsProps) => {
  const suggestions = useLiveQuery(
    query.suggestion.where({
      type: "label",
      entityId: threadId,
      organizationId: organizationId,
      active: true,
    }),
  ) as SuggestionRow[] | undefined;

  const activeSuggestions = useMemo(() => {
    if (!suggestions) return [];

    const appliedLabelIds = new Set(
      threadLabels?.map((tl) => tl.label.id) ?? [],
    );

    return suggestions.filter((s) => {
      if (!s.relatedEntityId) return false;
      if (appliedLabelIds.has(s.relatedEntityId)) return false;
      return s.active;
    });
  }, [suggestions, threadLabels]);

  const suggestedLabelIds = useMemo(() => {
    return activeSuggestions
      .filter(
        (s): s is typeof s & { relatedEntityId: string } => !!s.relatedEntityId,
      )
      .map((s) => s.relatedEntityId);
  }, [activeSuggestions]);

  const suggestedLabels = useLiveQuery(
    query.label.where({ id: { $in: suggestedLabelIds }, enabled: true }),
  );

  return {
    suggestedLabels,
    suggestions,
  };
};

type UsePendingStatusSuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
  currentStatus: number;
};

export const usePendingStatusSuggestions = ({
  threadId,
  organizationId,
  currentStatus,
}: UsePendingStatusSuggestionsProps) => {
  const suggestions = useLiveQuery(
    query.suggestion.where({
      type: "status",
      entityId: threadId,
      organizationId: organizationId,
      active: true,
    }),
  ) as SuggestionRow[] | undefined;

  const statusSuggestion = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return null;

    const suggestion = suggestions[0];
    if (!suggestion.resultsStr) return null;

    try {
      const results = JSON.parse(suggestion.resultsStr) as {
        suggestedStatus: number;
      };
      // Don't show if suggested status is the current status
      if (results.suggestedStatus === currentStatus) return null;

      return {
        suggestion,
        suggestedStatus: results.suggestedStatus,
        label: statusValues[results.suggestedStatus]?.label ?? "Unknown",
      };
    } catch {
      return null;
    }
  }, [suggestions, currentStatus]);

  return {
    statusSuggestion,
    suggestion: statusSuggestion?.suggestion,
  };
};

type UsePendingDuplicateSuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
};

type DuplicateThread = InferLiveObject<
  typeof schema.thread,
  { author: { user: true }; assignedUser: true }
>;

export const usePendingDuplicateSuggestions = ({
  threadId,
  organizationId,
}: UsePendingDuplicateSuggestionsProps) => {
  const suggestions = useLiveQuery(
    query.suggestion.where({
      type: "duplicate",
      entityId: threadId,
      organizationId: organizationId,
      active: true,
    }),
  ) as SuggestionRow[] | undefined;

  const duplicateSuggestion = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return null;

    const suggestion = suggestions[0];
    if (!suggestion.relatedEntityId) return null;

    let confidence: string | null = null;
    let reason: string | null = null;

    if (suggestion.resultsStr) {
      try {
        const results = JSON.parse(suggestion.resultsStr) as {
          confidence?: string;
          reason?: string;
        };
        confidence = results.confidence ?? null;
        reason = results.reason ?? null;
      } catch {
        // Ignore parse errors
      }
    }

    return {
      suggestion,
      duplicateThreadId: suggestion.relatedEntityId,
      confidence,
      reason,
    };
  }, [suggestions]);

  const duplicateThreadIds = useMemo(() => {
    if (!duplicateSuggestion?.duplicateThreadId) return [];
    return [duplicateSuggestion.duplicateThreadId];
  }, [duplicateSuggestion?.duplicateThreadId]);

  const duplicateThreads = useLiveQuery(
    query.thread
      .where({ id: { $in: duplicateThreadIds } })
      .include({ author: { user: true }, assignedUser: true }),
  ) as DuplicateThread[] | undefined;

  const duplicateThread = duplicateThreads?.[0] ?? null;

  return {
    duplicateSuggestion: duplicateSuggestion
      ? {
          ...duplicateSuggestion,
          thread: duplicateThread,
        }
      : null,
    suggestion: duplicateSuggestion?.suggestion,
  };
};

type DuplicateSuggestionData = {
  suggestion: SuggestionRow;
  duplicateThreadId: string;
  confidence: string | null;
  reason: string | null;
  thread: DuplicateThread | null;
} | null;

type StatusSuggestionData = {
  suggestion: SuggestionRow;
  suggestedStatus: number;
  label: string;
} | null;

type SuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
  suggestedLabels:
    | Array<{ id: string; name: string; color: string }>
    | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  suggestions: SuggestionRow[] | undefined;
  statusSuggestion: StatusSuggestionData;
  duplicateSuggestion: DuplicateSuggestionData;
  currentStatus: number;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
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

export const Suggestions = ({
  threadId,
  organizationId,
  suggestedLabels,
  threadLabels,
  suggestions,
  statusSuggestion,
  duplicateSuggestion,
  currentStatus,
  user,
  captureThreadEvent,
}: SuggestionsProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasLabelSuggestions = (suggestedLabels?.length ?? 0) > 0;
  const hasStatusSuggestion = statusSuggestion !== null;
  const hasDuplicateSuggestion =
    duplicateSuggestion !== null && duplicateSuggestion.thread !== null;
  const hasStatusOrLabelSuggestions =
    hasLabelSuggestions || hasStatusSuggestion;
  const hasSuggestions = hasStatusOrLabelSuggestions || hasDuplicateSuggestion;
  const previousHasSuggestionsRef = useRef(false);
  const [hoverCardOpen, setHoverCardOpen] = useState(false);
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

  const handleAcceptLabel = async (labelId: string) => {
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

  const handleAcceptAllLabels = async () => {
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

  const handleDismissAllLabels = async () => {
    const labelIds = suggestedLabels?.map((l) => l.id) ?? [];

    for (const labelId of labelIds) {
      updateSuggestionForLabel(labelId, false);
    }

    captureThreadEvent("support_intelligence:all_labels_dismissed", {
      label_count: labelIds.length,
    });
  };

  const handleAcceptStatus = async () => {
    if (!statusSuggestion || !organizationId) return;

    const oldStatus = currentStatus;
    const newStatus = statusSuggestion.suggestedStatus;
    const oldStatusLabel = statusValues[oldStatus]?.label ?? "Unknown";
    const newStatusLabel = statusSuggestion.label;

    // Update thread status
    mutate.thread.update(threadId, {
      status: newStatus,
    });

    // Create update record
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

    // Mark suggestion as accepted
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

  const handleDismissStatus = async () => {
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

  const handleAcceptDuplicate = async () => {
    if (!duplicateSuggestion || !organizationId) return;

    // Mark suggestion as accepted
    mutate.suggestion.update(duplicateSuggestion.suggestion.id, {
      accepted: true,
      active: false,
      updatedAt: new Date(),
    });

    // Set thread status to Duplicated (4)
    mutate.thread.update(threadId, { status: 4 });

    // Create update record for the duplicate link
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

  const handleDismissDuplicate = async () => {
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

  const handleAcceptAll = async () => {
    if (hasStatusSuggestion) {
      await handleAcceptStatus();
    }
    if (hasLabelSuggestions) {
      await handleAcceptAllLabels();
    }
    if (hasDuplicateSuggestion) {
      await handleAcceptDuplicate();
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
      await handleDismissDuplicate();
    }
  };

  return (
    <div
      className="flex flex-col h-0 px-4 overflow-hidden transition-all duration-200 ease-in-out data-[state=open]:h-auto data-[state=open]:py-4"
      data-state={hasSuggestions ? "open" : "closed"}
    >
      <div className="flex gap-4 items-center">
        <Zap className="size-3.5 stroke-2" />
        <div className="flex-1">Support Intelligence</div>
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
      </div>
      <div
        className="overflow-hidden text-sm transition-all duration-200 ease-in-out data-[state=closed]:max-h-0 data-[state=open]:max-h-96"
        data-state={isCollapsed ? "closed" : "open"}
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
                              fallback={duplicateSuggestion.thread.author?.name}
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
                                status={duplicateSuggestion.thread.status ?? 0}
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
                              duplicateSuggestion.thread.assignedUser?.name ? (
                                <>
                                  <Avatar
                                    variant="user"
                                    size="sm"
                                    fallback={
                                      duplicateSuggestion.thread.assignedUser
                                        ?.name
                                    }
                                    src={
                                      duplicateSuggestion.thread.assignedUser
                                        ?.image ?? undefined
                                    }
                                  />
                                  <span className="text-sm">
                                    {
                                      duplicateSuggestion.thread.assignedUser
                                        ?.name
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
      </div>
    </div>
  );
};
