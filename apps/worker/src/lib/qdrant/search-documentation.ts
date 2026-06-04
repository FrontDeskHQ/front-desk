import { google } from "@ai-sdk/google";
import { embed } from "ai";
import { qdrantClient } from "./client";
import type { DocumentationChunkPayload } from "./documentation";
import { DOCUMENTATION_COLLECTION } from "./documentation";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);

export type DocumentationSearchHit = {
  pageUrl: string;
  pageTitle: string;
  chunkText: string;
  headingHierarchy: string[];
  score: number;
};

export type DocumentationPageChunk = {
  pageUrl: string;
  pageTitle: string;
  chunkText: string;
  headingHierarchy: string[];
  chunkIndex: number;
};

const generateQueryEmbedding = async (
  query: string,
): Promise<number[] | null> => {
  if (!query.trim()) return null;

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
      providerOptions: {
        google: {
          taskType: "RETRIEVAL_QUERY",
        },
      },
    });
    return embedding;
  } catch (error) {
    console.error("Failed to generate documentation query embedding:", error);
    return null;
  }
};

export async function searchDocumentation(options: {
  query: string;
  organizationId: string;
  limit?: number;
}): Promise<DocumentationSearchHit[]> {
  const { query, organizationId, limit = 5 } = options;

  const denseQueryEmbedding = await generateQueryEmbedding(query);
  if (!denseQueryEmbedding) {
    return [];
  }

  try {
    const results = await qdrantClient.query(DOCUMENTATION_COLLECTION, {
      prefetch: [
        {
          query: denseQueryEmbedding,
          using: "dense",
          limit,
        },
        {
          query: {
            text: query,
            model: "qdrant/bm25",
          } as unknown as number[],
          using: "bm25",
          limit,
        },
      ],
      query: { fusion: "rrf" },
      filter: {
        must: [{ key: "organizationId", match: { value: organizationId } }],
      },
      with_payload: true,
      limit,
    });

    return results.points.map((point) => {
      const payload = point.payload as unknown as DocumentationChunkPayload;
      return {
        pageUrl: payload.pageUrl,
        pageTitle: payload.pageTitle,
        chunkText: payload.chunkText,
        headingHierarchy: payload.headingHierarchy,
        score: point.score ?? 0,
      };
    });
  } catch (error) {
    // TODO: This swallows embedding/query failures and returns [], which is
    // indistinguishable from a genuine no-results. Revisit to surface failures
    // (explicit Result type or propagated error) so callers can tell them apart.
    console.error("Failed to search documentation in Qdrant:", error);
    return [];
  }
}

export async function readDocumentationPage(options: {
  pageUrl: string;
  organizationId: string;
  limit?: number;
}): Promise<DocumentationPageChunk[]> {
  const { pageUrl, organizationId, limit = 50 } = options;

  if (!pageUrl.trim()) return [];

  try {
    const results = await qdrantClient.scroll(DOCUMENTATION_COLLECTION, {
      filter: {
        must: [
          { key: "organizationId", match: { value: organizationId } },
          { key: "pageUrl", match: { value: pageUrl } },
        ],
      },
      with_payload: true,
      limit,
    });

    return results.points
      .map((point) => {
        const payload = point.payload as unknown as DocumentationChunkPayload;
        return {
          pageUrl: payload.pageUrl,
          pageTitle: payload.pageTitle,
          chunkText: payload.chunkText,
          headingHierarchy: payload.headingHierarchy,
          chunkIndex: payload.chunkIndex,
        };
      })
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  } catch (error) {
    console.error("Failed to read documentation page chunks in Qdrant:", error);
    return [];
  }
}
