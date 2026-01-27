import { useLiveQuery } from "@live-state/sync/client";
import { ActionButton } from "@workspace/ui/components/button";
import { Check, ChevronDown, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ulid } from "ulid";
import { mutate, query } from "~/lib/live-state";

type SuggestionRow = {
  id: string;
  relatedEntityId: string | null;
  active: boolean;
  accepted: boolean;
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

type LabelSuggestionProps = {
  threadId: string;
  organizationId: string | undefined;
  suggestedLabels:
    | Array<{ id: string; name: string; color: string }>
    | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  suggestions: SuggestionRow[] | undefined;
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
};

export const LabelSuggestions = ({
  threadId,
  organizationId,
  suggestedLabels,
  threadLabels,
  suggestions,
  captureThreadEvent,
}: LabelSuggestionProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasSuggestions = (suggestedLabels?.length ?? 0) > 0;
  const previousHasSuggestionsRef = useRef(false);

  useEffect(() => {
    if (hasSuggestions && !previousHasSuggestionsRef.current) {
      captureThreadEvent("support_intelligence:suggestions_shown", {
        suggestion_count: suggestedLabels?.length ?? 0,
      });
    }
    previousHasSuggestionsRef.current = hasSuggestions;
  }, [hasSuggestions, suggestedLabels?.length, captureThreadEvent]);

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
        <div className="flex gap-2 items-center border-input mt-2">
          <div className="text-foreground-secondary mr-2">Suggestions</div>
          {suggestedLabels?.map((label) => {
            return (
              <ActionButton
                key={label.id}
                variant="ghost"
                size="sm"
                tooltip={`Add ${label.name} label`}
                className="border border-dashed border-input dark:hover:bg-foreground-tertiary/15"
                onClick={() => handleAcceptLabel(label.id)}
              >
                <div
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor: label.color,
                  }}
                />
                {label.name}
              </ActionButton>
            );
          })}
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Accept all"
            className="text-foreground-secondary"
            onClick={handleAcceptAllLabels}
          >
            <Check />
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Ignore all"
            className="text-foreground-secondary"
            onClick={handleDismissAllLabels}
          >
            <X />
          </ActionButton>
        </div>
      </div>
    </div>
  );
};
