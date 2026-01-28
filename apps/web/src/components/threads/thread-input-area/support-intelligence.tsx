import { useLiveQuery } from "@live-state/sync/client";
import { ActionButton } from "@workspace/ui/components/button";
import {
  createHoverCardHandle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import {
  StatusIndicator,
  statusValues,
} from "@workspace/ui/components/indicator";
import { Separator } from "@workspace/ui/components/separator";
import { Check, ChevronDown, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ulid } from "ulid";
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

type StatusSuggestionData = {
  suggestion: SuggestionRow;
  suggestedStatus: number;
  label: string;
} | null;

type LabelSuggestionProps = {
  threadId: string;
  organizationId: string | undefined;
  suggestedLabels:
    | Array<{ id: string; name: string; color: string }>
    | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  suggestions: SuggestionRow[] | undefined;
  statusSuggestion: StatusSuggestionData;
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
  currentStatus,
  user,
  captureThreadEvent,
}: LabelSuggestionProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasLabelSuggestions = (suggestedLabels?.length ?? 0) > 0;
  const hasStatusSuggestion = statusSuggestion !== null;
  const hasSuggestions = hasLabelSuggestions || hasStatusSuggestion;
  const previousHasSuggestionsRef = useRef(false);
  const [hoverCardOpen, setHoverCardOpen] = useState(false);

  useEffect(() => {
    if (hasSuggestions && !previousHasSuggestionsRef.current) {
      captureThreadEvent("support_intelligence:suggestions_shown", {
        label_suggestion_count: suggestedLabels?.length ?? 0,
        has_status_suggestion: hasStatusSuggestion,
      });
    }
    previousHasSuggestionsRef.current = hasSuggestions;
  }, [
    hasSuggestions,
    suggestedLabels?.length,
    hasStatusSuggestion,
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

  const handleAcceptAll = async () => {
    if (hasStatusSuggestion) {
      await handleAcceptStatus();
    }
    if (hasLabelSuggestions) {
      await handleAcceptAllLabels();
    }
  };

  const handleDismissAll = async () => {
    if (hasStatusSuggestion) {
      await handleDismissStatus();
    }
    if (hasLabelSuggestions) {
      await handleDismissAllLabels();
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
            className={`text-muted-foreground pointer-events-none size-4 shrink-0 transition-transform duration-200 ${
              isCollapsed ? "" : "rotate-180"
            }`}
          />
        </ActionButton>
      </div>
      <div
        className="overflow-hidden text-sm transition-all duration-200 ease-in-out data-[state=closed]:max-h-0 data-[state=open]:max-h-96"
        data-state={isCollapsed ? "closed" : "open"}
      >
        <div className="flex gap-2 items-center border-input mt-2 flex-wrap">
          <div className="text-foreground-secondary mr-2">Suggestions</div>

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
                  <StatusIndicator status={statusSuggestion.suggestedStatus} />
                  {statusSuggestion.label}
                </HoverCardTrigger>
              );
            })()}
          {suggestedLabels?.map((label) => {
            return (
              <HoverCardTrigger
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
          <HoverCard
            handle={hoverCardHandle}
            open={hoverCardOpen && hasSuggestions}
            onOpenChange={setHoverCardOpen}
          >
            {({ payload }) => (
              <HoverCardContent className="w-80 flex flex-col gap-3">
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
                  onClick={payload?.handleAccept}
                  className="w-full"
                >
                  Apply suggestion
                </ActionButton>
              </HoverCardContent>
            )}
          </HoverCard>
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
    </div>
  );
};
