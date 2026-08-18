import { google } from "@ai-sdk/google";
import { embed } from "ai";

import type { AgentRunAudit } from "../pipeline/core/agent-run-audit";
import { auditEmbedding } from "../pipeline/core/model-audit";
import type { WorkerLogger } from "./logging";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);

/**
 * Generate a normalized embedding vector for an external entity (PR, issue) or
 * a query against one. Uses SEMANTIC_SIMILARITY (matching the thread index) so
 * entity and thread vectors live in a comparable space for cross-searches.
 */
export const generateSimilarityEmbedding = async (
  text: string,
  requestLog?: WorkerLogger,
  audit?: AgentRunAudit
): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  const span = auditEmbedding(audit, {
    modelId: EMBEDDING_MODEL,
    processor: "synthesis",
    taskType: "SEMANTIC_SIMILARITY",
    text,
  });

  let embedding: number[];
  let usage: unknown;
  try {
    ({ embedding, usage } = await embed({
      model: embeddingModel,
      providerOptions: {
        google: { taskType: "SEMANTIC_SIMILARITY" },
      },
      value: text,
    }));
  } catch (error) {
    span.failed(error);
    throw error;
  }

  const norm = Math.hypot(...embedding);
  if (!Number.isFinite(norm) || norm === 0) {
    requestLog?.warn("Embedding normalization produced an invalid norm", {
      embedding: { dimensions: embedding.length, norm },
      step: "normalize_embedding",
    });
    span.completed(embedding, usage, { normalized: false });
    return embedding;
  }

  const normalized = embedding.map((value) => value / norm);
  span.completed(normalized, usage, { normalized: true });
  return normalized;
};
