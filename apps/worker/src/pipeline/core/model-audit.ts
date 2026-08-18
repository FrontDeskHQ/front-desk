import { createHash } from "node:crypto";

import type { AgentRunAudit } from "./agent-run-audit";

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

/**
 * Opens an `embedding` model span on the audit. Every embedding call records the
 * same request/completion/failure shape, so call sites only supply what differs:
 * the task type, the processor, and whether they normalized the vector.
 */
export const auditEmbedding = (
  audit: AgentRunAudit | undefined,
  {
    modelId,
    processor,
    taskType,
    text,
  }: {
    modelId: string;
    processor: string;
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";
    text: string;
  }
) => {
  const startedAt = performance.now();
  const where = { phase: "model", processor } as const;
  const request = {
    input: { chars: text.length, hash: sha256(text) },
    kind: "embedding",
    model: { modelId, provider: "google" },
    providerOptions: { google: { taskType } },
  };

  audit?.record("model.requested", request, where);

  return {
    completed: (
      embedding: number[],
      usage: unknown,
      { normalized }: { normalized: boolean }
    ) => {
      audit?.record(
        "model.completed",
        {
          ...request,
          dimensions: embedding.length,
          durationMs: performance.now() - startedAt,
          embeddingHash: sha256(JSON.stringify(embedding)),
          normalized,
          status: "completed",
          usage,
        },
        where
      );
    },
    failed: (error: unknown) => {
      audit?.record(
        "model.failed",
        {
          ...request,
          durationMs: performance.now() - startedAt,
          error,
          status: "failed",
        },
        where
      );
    },
  };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

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
