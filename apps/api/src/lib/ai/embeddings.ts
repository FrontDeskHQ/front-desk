import { google } from "@ai-sdk/google";
import { embed } from "ai";

const EMBEDDING_MODEL = "gemini-embedding-001";

const embeddingModel = google.embedding(EMBEDDING_MODEL);

export const generateEmbedding = async (
  text: string,
  task:
    | "SEMANTIC_SIMILARITY"
    | "CLASSIFICATION"
    | "CLUSTERING"
    | "RETRIEVAL_DOCUMENT"
    | "RETRIEVAL_QUERY"
    | "QUESTION_ANSWERING"
    | "FACT_VERIFICATION"
    | "CODE_RETRIEVAL_QUERY" = "SEMANTIC_SIMILARITY",
  outputDimensionality?: number
): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
      providerOptions: {
        google: {
          taskType: task,
          ...(outputDimensionality !== undefined && { outputDimensionality }),
        },
      },
    });

    const norm = Math.hypot(...embedding);

    if (!Number.isFinite(norm) || norm === 0) {
      console.warn("Embedding normalization failed: invalid norm", norm);
      return embedding;
    }

    return embedding.map((value) => value / norm);
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null;
  }
};
