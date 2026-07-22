import { QdrantClient } from "@qdrant/js-client-rest";

import { generateEmbedding } from "../ai/embeddings";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const { QDRANT_API_KEY } = process.env;

const MESSAGES_COLLECTION = "messages-v1";
const DOCUMENTATION_COLLECTION = "documentation-v1";

const qdrantClient = new QdrantClient({
  apiKey: QDRANT_API_KEY,
  url: QDRANT_URL,
});

export async function searchMessages(options: {
  query: string;
  organizationId: string;
  limit?: number;
}): Promise<{ messageId: string; threadId: string; score: number }[]> {
  const { query, organizationId, limit = 20 } = options;

  const denseQueryEmbedding = await generateEmbedding(query, "RETRIEVAL_QUERY");

  if (!denseQueryEmbedding) {
    console.error("Failed to generate query embedding for search");
    return [];
  }

  try {
    const results = await qdrantClient.query(MESSAGES_COLLECTION, {
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
      const payload = point.payload as unknown as {
        messageId: string;
        threadId: string;
      };
      return {
        messageId: payload.messageId,
        score: point.score,
        threadId: payload.threadId,
      };
    });
  } catch (error) {
    console.error("Failed to search messages in Qdrant:", error);
    return [];
  }
}

export async function searchDocumentation(options: {
  query: string;
  organizationId: string;
  limit?: number;
}): Promise<
  {
    pageUrl: string;
    pageTitle: string;
    chunkText: string;
    headingHierarchy: string[];
    score: number;
  }[]
> {
  const { query, organizationId, limit = 5 } = options;

  const denseQueryEmbedding = await generateEmbedding(query, "RETRIEVAL_QUERY");

  if (!denseQueryEmbedding) {
    console.error(
      "Failed to generate query embedding for documentation search"
    );
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
      const payload = point.payload as unknown as {
        pageUrl: string;
        pageTitle: string;
        chunkText: string;
        headingHierarchy: string[];
      };
      return {
        chunkText: payload.chunkText,
        headingHierarchy: payload.headingHierarchy,
        pageTitle: payload.pageTitle,
        pageUrl: payload.pageUrl,
        score: point.score,
      };
    });
  } catch (error) {
    console.error("Failed to search documentation in Qdrant:", error);
    return [];
  }
}
