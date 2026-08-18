import { createHash } from "node:crypto";

import { google } from "@ai-sdk/google";
import { embed } from "ai";

import type { AgentRunAudit } from "../pipeline/core/agent-run-audit";
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

  const startedAt = performance.now();
  const model = {
    modelId: EMBEDDING_MODEL,
    provider: "google",
  };
  const metadata = {
    input: {
      chars: text.length,
      hash: createHash("sha256").update(text).digest("hex"),
    },
    kind: "embedding",
    model,
    providerOptions: { google: { taskType: "SEMANTIC_SIMILARITY" } },
  };
  audit?.record("model.requested", metadata, {
    phase: "model",
    processor: "synthesis",
  });

  try {
    const { embedding, usage } = await embed({
      model: embeddingModel,
      providerOptions: {
        google: { taskType: "SEMANTIC_SIMILARITY" },
      },
      value: text,
    });

    const norm = Math.hypot(...embedding);
    if (!Number.isFinite(norm) || norm === 0) {
      requestLog?.warn("Embedding normalization produced an invalid norm", {
        embedding: { dimensions: embedding.length, norm },
        step: "normalize_embedding",
      });
      audit?.record(
        "model.completed",
        {
          ...metadata,
          dimensions: embedding.length,
          durationMs: performance.now() - startedAt,
          embeddingHash: createHash("sha256")
            .update(JSON.stringify(embedding))
            .digest("hex"),
          normalized: false,
          status: "completed",
          usage,
        },
        { phase: "model", processor: "synthesis" }
      );
      return embedding;
    }

    const normalizedEmbedding = embedding.map((value) => value / norm);
    audit?.record(
      "model.completed",
      {
        ...metadata,
        dimensions: normalizedEmbedding.length,
        durationMs: performance.now() - startedAt,
        embeddingHash: createHash("sha256")
          .update(JSON.stringify(normalizedEmbedding))
          .digest("hex"),
        normalized: true,
        status: "completed",
        usage,
      },
      { phase: "model", processor: "synthesis" }
    );
    return normalizedEmbedding;
  } catch (error) {
    audit?.record(
      "model.failed",
      {
        ...metadata,
        durationMs: performance.now() - startedAt,
        error,
        status: "failed",
      },
      { phase: "model", processor: "synthesis" }
    );
    throw error;
  }
};
