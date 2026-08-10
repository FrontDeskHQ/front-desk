// Reads the inline-track suggestions off `thread.inlineSuggestions` (the
// suggestion table was dropped in the signals overhaul) and shapes them for the
// quick-actions toolbar. Only the inline-track kinds surface here — `apply_label`
// and `set_status`; synthesis-track reads (reply / duplicate / close) render in
// the signals feed via ThreadReadCard.

import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import type { schema } from "api/schema";
import { useMemo } from "react";

import { query } from "~/lib/live-state";

export interface LabelSuggestion {
  suggestionId: string;
  id: string;
  name: string;
  color: string;
}

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
        (suggestion) => !suggestion.dismissedAt
      ),
    [thread?.inlineSuggestions]
  );
};

interface UsePendingLabelSuggestionsProps {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: { id: string; label: { id: string } }[] | undefined;
}

export const usePendingLabelSuggestions = ({
  threadId,
  organizationId,
  threadLabels,
}: UsePendingLabelSuggestionsProps) => {
  const suggestions = useInlineSuggestions(threadId);
  const labels = useLiveQuery(
    query.label.where({ enabled: true, organizationId })
  );

  const suggestedLabels = useMemo<LabelSuggestion[] | undefined>(() => {
    if (!labels) {
      return;
    }

    const labelById = new Map(labels.map((label) => [label.id, label]));
    const attachedLabelIds = new Set(
      (threadLabels ?? []).map((threadLabel) => threadLabel.label.id)
    );

    const result: LabelSuggestion[] = [];
    const seenLabelIds = new Set<string>();
    for (const suggestion of suggestions) {
      if (suggestion.action.kind !== "apply_label") {
        continue;
      }
      const { labelId } = suggestion.action;
      if (attachedLabelIds.has(labelId)) {
        continue;
      }
      if (seenLabelIds.has(labelId)) {
        continue;
      }
      const label = labelById.get(labelId);
      if (!label) {
        continue;
      }
      seenLabelIds.add(labelId);
      result.push({
        color: label.color,
        id: label.id,
        name: label.name,
        suggestionId: suggestion.id,
      });
    }
    return result;
  }, [labels, suggestions, threadLabels]);

  return { suggestedLabels };
};

interface UsePendingStatusSuggestionsProps {
  threadId: string;
  organizationId: string | undefined;
  currentStatus: number;
}

/**
 * Always null since ADR 0014: `set_status` left the inline-suggestion surface
 * for the thread read, so nothing writes a status chip any more.
 *
 * TODO(status-in-toolbar): the toolbar's status affordance is intentionally
 * kept wired but inert rather than deleted — repointing it at
 * `thread.agentRead`'s primary `set_status` is a UI change of its own, and
 * doing it here would bury it inside the vocabulary cut-over.
 */
export const usePendingStatusSuggestions = (
  _props: UsePendingStatusSuggestionsProps
) => {
  const statusSuggestion = useMemo<StatusSuggestionData>(() => null, []);

  return { statusSuggestion };
};

interface UsePendingDuplicateSuggestionsProps {
  threadId: string;
  organizationId: string | undefined;
}

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
  _props: UsePendingDuplicateSuggestionsProps
) => ({ duplicateSuggestion: null as DuplicateSuggestionData });
