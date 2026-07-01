// Reads the inline-track suggestions off `thread.inlineSuggestions` (the
// suggestion table was dropped in the signals overhaul) and shapes them for the
// quick-actions toolbar. Only the inline-track kinds surface here — `apply_label`
// and `set_status`; synthesis-track reads (reply / duplicate / close) render in
// the signals feed via ThreadReadCard.

import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { STATUS_LABELS } from "@workspace/schemas/signals";
import { statusValues } from "@workspace/ui/components/indicator";
import type { schema } from "api/schema";
import { useMemo } from "react";
import { query } from "~/lib/live-state";

export type LabelSuggestion = {
  suggestionId: string;
  id: string;
  name: string;
  color: string;
};

export type StatusSuggestionData = {
  suggestionId: string;
  suggestedStatus: number;
  label: string;
} | null;

const useInlineSuggestions = (threadId: string) => {
  const threads = useLiveQuery(query.thread.where({ id: threadId }));
  const thread = threads?.[0];
  return useMemo(
    () =>
      (thread?.inlineSuggestions ?? []).filter(
        (suggestion) => !suggestion.dismissedAt,
      ),
    [thread?.inlineSuggestions],
  );
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
  const suggestions = useInlineSuggestions(threadId);
  const labels = useLiveQuery(
    query.label.where({ organizationId, enabled: true }),
  );

  const suggestedLabels = useMemo<LabelSuggestion[] | undefined>(() => {
    if (!labels) return undefined;

    const labelById = new Map(labels.map((label) => [label.id, label]));
    const attachedLabelIds = new Set(
      (threadLabels ?? []).map((threadLabel) => threadLabel.label.id),
    );

    const result: LabelSuggestion[] = [];
    const seenLabelIds = new Set<string>();
    for (const suggestion of suggestions) {
      if (suggestion.action.kind !== "apply_label") continue;
      const labelId = suggestion.action.labelId;
      if (attachedLabelIds.has(labelId)) continue;
      if (seenLabelIds.has(labelId)) continue;
      const label = labelById.get(labelId);
      if (!label) continue;
      seenLabelIds.add(labelId);
      result.push({
        suggestionId: suggestion.id,
        id: label.id,
        name: label.name,
        color: label.color,
      });
    }
    return result;
  }, [labels, suggestions, threadLabels]);

  return { suggestedLabels };
};

type UsePendingStatusSuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
  currentStatus: number;
};

const statusLabel = (status: number): string =>
  statusValues[status]?.label ?? STATUS_LABELS[status] ?? `Status ${status}`;

export const usePendingStatusSuggestions = ({
  threadId,
  currentStatus,
}: UsePendingStatusSuggestionsProps) => {
  const suggestions = useInlineSuggestions(threadId);

  const statusSuggestion = useMemo<StatusSuggestionData>(() => {
    for (const suggestion of suggestions) {
      if (suggestion.action.kind !== "set_status") continue;
      const suggestedStatus = suggestion.action.status;
      if (suggestedStatus === currentStatus) continue;
      return {
        suggestionId: suggestion.id,
        suggestedStatus,
        label: statusLabel(suggestedStatus),
      };
    }
    return null;
  }, [suggestions, currentStatus]);

  return { statusSuggestion };
};

type UsePendingDuplicateSuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
};

type DuplicateThread = InferLiveObject<
  typeof schema.thread,
  { author: { include: { user: true } }; assignedUser: true }
>;

export type DuplicateSuggestionData = {
  suggestionId: string;
  duplicateThreadId: string;
  confidence: string | null;
  reason: string | null;
  thread: DuplicateThread | null;
} | null;

// Duplicate detection moved to the synthesis track (rendered in the signals
// feed as a `mark_duplicate` agent read), so no duplicate surfaces on the
// inline toolbar. Kept as a no-op hook so the quick-actions layout stays intact.
export const usePendingDuplicateSuggestions = (
  _props: UsePendingDuplicateSuggestionsProps,
) => {
  return { duplicateSuggestion: null as DuplicateSuggestionData };
};
