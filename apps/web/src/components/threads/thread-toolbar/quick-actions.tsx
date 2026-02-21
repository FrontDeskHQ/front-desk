import { ActionButton } from "@workspace/ui/components/button";
import { X } from "lucide-react";
import {
  Suggestions,
  usePendingDuplicateSuggestions,
  usePendingLabelSuggestions,
  usePendingStatusSuggestions,
} from "~/components/threads/thread-input-area-deprecated/support-intelligence";

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
  return (
    <div data-slot="quick-actions-panel" className="relative">
      <Suggestions
        threadId={threadId}
        organizationId={organizationId}
        suggestedLabels={suggestionsData.suggestedLabels}
        threadLabels={threadLabels}
        suggestions={suggestionsData.suggestions}
        statusSuggestion={suggestionsData.statusSuggestion}
        duplicateSuggestion={suggestionsData.duplicateSuggestion}
        currentStatus={currentStatus}
        user={user}
        captureThreadEvent={captureThreadEvent}
      />
      {showClose && (
        <ActionButton
          variant="ghost"
          size="icon-sm"
          tooltip="Close"
          className="text-foreground-secondary absolute top-4 right-4"
          onClick={onClose}
        >
          <X className="size-4" />
        </ActionButton>
      )}
    </div>
  );
};
