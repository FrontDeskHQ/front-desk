const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const observableContent = (content: unknown): unknown => {
  if (!Array.isArray(content)) {
    return content;
  }

  return content.filter((part) => {
    const type = asRecord(part)?.type;
    return (
      type !== "reasoning" &&
      type !== "reasoning-file" &&
      type !== "redacted-reasoning"
    );
  });
};

/** Keep model evidence useful without persisting hidden chain-of-thought. */
export const serializeObservableModelStep = (step: {
  content?: unknown;
  finishReason?: unknown;
  model?: unknown;
  providerMetadata?: unknown;
  rawFinishReason?: unknown;
  response?: unknown;
  staticToolCalls?: unknown;
  staticToolResults?: unknown;
  text?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  usage?: unknown;
}) => {
  const response = asRecord(step.response);

  return {
    content: observableContent(step.content),
    finishReason: step.finishReason,
    model: step.model,
    providerMetadata: step.providerMetadata,
    rawFinishReason: step.rawFinishReason,
    response: response
      ? {
          id: response.id,
          modelId: response.modelId,
          timestamp: response.timestamp,
        }
      : null,
    staticToolCalls: step.staticToolCalls,
    staticToolResults: step.staticToolResults,
    text: step.text,
    toolCalls: step.toolCalls,
    toolResults: step.toolResults,
    usage: step.usage,
  };
};
