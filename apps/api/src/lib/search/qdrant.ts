import { QdrantClient } from "@qdrant/js-client-rest";
import { generateEmbedding } from "../ai/embeddings";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

const MESSAGES_COLLECTION = "messages-v1";
const DOCUMENTATION_COLLECTION = "documentation-v1";

const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

export async function searchMessages(options: {
  query: string;
  organizationId: string;
  limit?: number;
}): Promise<{ messageId: string; threadId: string; score: number }[]> {
  const { query, organizationId, limit = 20 } = options;

  const denseQueryEmbedding = await generateEmbedding(
    query,
    "RETRIEVAL_QUERY",
  );

  if (!denseQueryEmbedding) {
    console.error("Failed to generate query embedding for search");
    return [];
  }

  try {
    const results = await qdrantClient.query(MESSAGES_COLLECTION, {
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
        must: [
          { key: "organizationId", match: { value: organizationId } },
        ],
      },
      with_payload: true,
      limit,
    });

    return results.points.map((point) => {
      const payload = point.payload as unknown as {
        messageId: string;
        threadId: string;
      };
      return {
        messageId: payload.messageId,
        threadId: payload.threadId,
        score: point.score,
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

  const denseQueryEmbedding = await generateEmbedding(
    query,
    "RETRIEVAL_QUERY",
  );

  if (!denseQueryEmbedding) {
    console.error(
      "Failed to generate query embedding for documentation search",
    );
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
        must: [
          { key: "organizationId", match: { value: organizationId } },
        ],
      },
      with_payload: true,
      limit,
    });

    return results.points.map((point) => {
      const payload = point.payload as unknown as {
        pageUrl: string;
        pageTitle: string;
        chunkText: string;
        headingHierarchy: string[];
      };
      return {
        pageUrl: payload.pageUrl,
        pageTitle: payload.pageTitle,
        chunkText: payload.chunkText,
        headingHierarchy: payload.headingHierarchy,
        score: point.score,
      };
    });
  } catch (error) {
    console.error("Failed to search documentation in Qdrant:", error);
    return [];
  }
}
