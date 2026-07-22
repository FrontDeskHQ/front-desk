import { google } from "@ai-sdk/google";
import { embed } from "ai";

import { qdrantClient } from "./client";
import type { DocumentationChunkPayload } from "./documentation";
import { DOCUMENTATION_COLLECTION } from "./documentation";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);

export interface DocumentationSearchHit {
  pageUrl: string;
  pageTitle: string;
  chunkText: string;
  headingHierarchy: string[];
  score: number;
}

export interface DocumentationPageChunk {
  pageUrl: string;
  pageTitle: string;
  chunkText: string;
  headingHierarchy: string[];
  chunkIndex: number;
}

const generateQueryEmbedding = async (
  query: string
): Promise<number[] | null> => {
  if (!query.trim()) {
    return null;
  }

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      providerOptions: {
        google: {
          taskType: "RETRIEVAL_QUERY",
        },
      },
      value: query,
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
      filter: {
        must: [{ key: "organizationId", match: { value: organizationId } }],
      },
      limit,
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
      with_payload: true,
    });

    return results.points.map((point) => {
      const payload = point.payload as unknown as DocumentationChunkPayload;
      return {
        chunkText: payload.chunkText,
        headingHierarchy: payload.headingHierarchy,
        pageTitle: payload.pageTitle,
        pageUrl: payload.pageUrl,
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

  if (!pageUrl.trim()) {
    return [];
  }

  try {
    const results = await qdrantClient.scroll(DOCUMENTATION_COLLECTION, {
      filter: {
        must: [
          { key: "organizationId", match: { value: organizationId } },
          { key: "pageUrl", match: { value: pageUrl } },
        ],
      },
      limit,
      with_payload: true,
    });

    return results.points
      .map((point) => {
        const payload = point.payload as unknown as DocumentationChunkPayload;
        return {
          chunkIndex: payload.chunkIndex,
          chunkText: payload.chunkText,
          headingHierarchy: payload.headingHierarchy,
          pageTitle: payload.pageTitle,
          pageUrl: payload.pageUrl,
        };
      })
      .toSorted((a, b) => a.chunkIndex - b.chunkIndex);
  } catch (error) {
    console.error("Failed to read documentation page chunks in Qdrant:", error);
    return [];
  }
}
