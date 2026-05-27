// TODO(signals-overhaul issue 10): rewrite against thread.agentRead /
// thread.inlineSuggestions. The suggestion table was dropped in issue 02;
// these hooks return empty data and Suggestions renders null until then.

import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";

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

export const usePendingLabelSuggestions = (
  _props: UsePendingLabelSuggestionsProps,
) => {
  return {
    suggestedLabels: undefined as
      | Array<{ id: string; name: string; color: string }>
      | undefined,
    suggestions: undefined as SuggestionRow[] | undefined,
  };
};

type UsePendingStatusSuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
  currentStatus: number;
};

type StatusSuggestionData = {
  suggestion: SuggestionRow;
  suggestedStatus: number;
  label: string;
} | null;

export const usePendingStatusSuggestions = (
  _props: UsePendingStatusSuggestionsProps,
) => {
  return {
    statusSuggestion: null as StatusSuggestionData,
    suggestion: undefined as SuggestionRow | undefined,
  };
};

type UsePendingDuplicateSuggestionsProps = {
  threadId: string;
  organizationId: string | undefined;
};

type DuplicateThread = InferLiveObject<
  typeof schema.thread,
  { author: { include: { user: true } }; assignedUser: true }
>;

type DuplicateSuggestionData = {
  suggestion: SuggestionRow;
  duplicateThreadId: string;
  confidence: string | null;
  reason: string | null;
  thread: DuplicateThread | null;
} | null;

export const usePendingDuplicateSuggestions = (
  _props: UsePendingDuplicateSuggestionsProps,
) => {
  return {
    duplicateSuggestion: null as DuplicateSuggestionData,
    suggestion: undefined as SuggestionRow | undefined,
  };
};

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

export const Suggestions = (_props: SuggestionsProps) => {
  return null;
};
