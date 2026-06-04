// TODO(signals-overhaul issue 10): rewrite against thread.agentRead /
// thread.inlineSuggestions. The suggestion table was dropped in issue 02;
// this component is stubbed (renders null) until then.

interface LinkedPrSuggestionsSectionProps {
  threadId: string;
  externalPrId: string | null;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
}

export function LinkedPrSuggestionsSection(
  _props: LinkedPrSuggestionsSectionProps,
) {
  return null;
}
