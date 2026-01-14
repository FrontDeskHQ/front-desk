import { useLiveQuery } from "@live-state/sync/client";
import { ActionButton } from "@workspace/ui/components/button";
import { Check, X, Zap } from "lucide-react";
import { useMemo } from "react";
import { ulid } from "ulid";
import { mutate, query } from "~/lib/live-state";

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
  const suggestion = useLiveQuery(
    query.suggestion.first({
      type: "label",
      entityId: threadId,
      organizationId: organizationId,
    }),
  );

  const suggestionMetadata = useMemo(() => {
    if (!suggestion?.metadataStr) {
      return { dismissed: [], accepted: [] };
    }
    try {
      return JSON.parse(suggestion.metadataStr) as {
        dismissed?: string[];
        accepted?: string[];
      };
    } catch {
      return { dismissed: [], accepted: [] };
    }
  }, [suggestion?.metadataStr]);

  const dismissedLabelIds = new Set(suggestionMetadata.dismissed ?? []);

  const suggestedLabelIdsFromResults = useMemo(() => {
    if (!suggestion?.resultsStr) return [];
    try {
      return JSON.parse(suggestion.resultsStr) as string[];
    } catch {
      return [];
    }
  }, [suggestion?.resultsStr]);

  const suggestedLabelIds = useMemo(() => {
    const appliedLabelIds = new Set(
      threadLabels?.map((tl) => tl.label.id) ?? [],
    );

    return suggestedLabelIdsFromResults.filter(
      (labelId) =>
        !appliedLabelIds.has(labelId) && !dismissedLabelIds.has(labelId),
    );
  }, [suggestedLabelIdsFromResults, threadLabels, dismissedLabelIds]);

  const suggestedLabels = useLiveQuery(
    query.label.where({ id: { $in: suggestedLabelIds }, enabled: true }),
  );

  return {
    suggestedLabels,
    suggestion,
  };
};

type LabelSuggestionProps = {
  threadId: string;
  organizationId: string | undefined;
  suggestedLabels:
    | Array<{ id: string; name: string; color: string }>
    | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  suggestion: { id: string; metadataStr: string | null } | undefined;
};

export const LabelSuggestions = ({
  threadId,
  organizationId,
  suggestedLabels,
  threadLabels,
  suggestion,
}: LabelSuggestionProps) => {
  const updateSuggestionMetadata = (
    acceptedLabelIds?: string[],
    dismissedLabelIds?: string[],
  ) => {
    if (!organizationId || !suggestion) return;

    const existingMetadata = suggestion.metadataStr
      ? (JSON.parse(suggestion.metadataStr) as {
          dismissed?: string[];
          accepted?: string[];
        })
      : { dismissed: [], accepted: [] };

    const metadata = { ...existingMetadata };

    if (acceptedLabelIds) {
      const acceptedSet = new Set([
        ...(metadata.accepted ?? []),
        ...acceptedLabelIds,
      ]);
      metadata.accepted = Array.from(acceptedSet);
    }

    if (dismissedLabelIds) {
      const dismissedSet = new Set([
        ...(metadata.dismissed ?? []),
        ...dismissedLabelIds,
      ]);
      metadata.dismissed = Array.from(dismissedSet);
    }

    mutate.suggestion.update(suggestion.id, {
      metadataStr: JSON.stringify(metadata),
      updatedAt: new Date(),
    });
  };

  const handleAcceptLabel = async (labelId: string) => {
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

    updateSuggestionMetadata([labelId]);
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
    }

    updateSuggestionMetadata(labelIds);
  };

  const handleDismissAllLabels = async () => {
    const labelIds = suggestedLabels?.map((l) => l.id) ?? [];
    updateSuggestionMetadata(undefined, labelIds);
  };

  if (suggestedLabels?.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 items-center px-4 py-2 border-t border-input">
      <Zap className="size-3.5 text-foreground-secondary stroke-2" />
      <div className="text-foreground-secondary mr-2">Label suggestions</div>

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
  );
};
