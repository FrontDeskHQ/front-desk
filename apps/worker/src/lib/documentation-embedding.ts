import { google } from "@ai-sdk/google";
import { log } from "@workspace/utils/logging";
import { embed } from "ai";

import { errorFields } from "./logging";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);

/**
 * Embed a documentation search query for the dense leg of the hybrid search.
 *
 * Uses RETRIEVAL_QUERY rather than the SEMANTIC_SIMILARITY task the entity
 * indexes use, matching the RETRIEVAL_DOCUMENT task the chunks were stored
 * with. Returns `null` on failure so a caller can decide whether that means
 * "no results" (a tool probe) or "abort" — the documentation index itself never
 * embeds, so this choice stays visible at the call site.
 *
 * Deliberately not L2-normalized: Qdrant normalizes both stored and query
 * vectors for `Cosine` distance, so client-side normalization would not change
 * ranking (see ADR 0012).
 */
export const generateDocumentationQueryEmbedding = async (
  query: string
): Promise<number[] | null> => {
  if (!query.trim()) {
    return null;
  }

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      providerOptions: {
        google: { taskType: "RETRIEVAL_QUERY" },
      },
      value: query,
    });
    return embedding;
  } catch (error) {
    log.error({
      action: "worker.documentation_search",
      operation: "query_embedding.generate",
      error: errorFields(error),
    });
    return null;
  }
};
