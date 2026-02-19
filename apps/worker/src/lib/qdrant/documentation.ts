import { qdrantClient } from "./client";

export const DOCUMENTATION_COLLECTION = "documentation-v1";
export const DOCUMENTATION_EMBEDDING_DIMENSIONS = 3072;

export interface DocumentationChunkPayload {
  organizationId: string;
  documentationSourceId: string;
  pageUrl: string;
  pageTitle: string;
  chunkIndex: number;
  chunkText: string;
  headingHierarchy: string[];
}

export const ensureDocumentationCollection = async (): Promise<boolean> => {
  try {
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (c) => c.name === DOCUMENTATION_COLLECTION,
    );

    if (collectionExists) {
      return true;
    }

    await qdrantClient.createCollection(DOCUMENTATION_COLLECTION, {
      vectors: {
        dense: {
          size: DOCUMENTATION_EMBEDDING_DIMENSIONS,
          distance: "Cosine",
        },
      },
      sparse_vectors: {
        bm25: { modifier: "idf" },
      },
      optimizers_config: {
        indexing_threshold: 0,
      },
    });

    await qdrantClient.createPayloadIndex(DOCUMENTATION_COLLECTION, {
      field_name: "organizationId",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(DOCUMENTATION_COLLECTION, {
      field_name: "documentationSourceId",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(DOCUMENTATION_COLLECTION, {
      field_name: "pageUrl",
      field_schema: "keyword",
    });

    console.log(`Created Qdrant collection: ${DOCUMENTATION_COLLECTION}`);
    return true;
  } catch (error) {
    console.error("Failed to ensure documentation collection:", error);
    return false;
  }
};

export const upsertDocumentationChunksBatch = async (
  points: Array<{
    id: string;
    vector: {
      dense: number[];
      bm25: { text: string; model: "qdrant/bm25" };
    };
    payload: DocumentationChunkPayload;
  }>,
): Promise<boolean> => {
  try {
    await qdrantClient.upsert(DOCUMENTATION_COLLECTION, {
      wait: true,
      points: points.map((point) => ({
        id: point.id,
        vector: point.vector as unknown as Record<string, unknown>,
        payload: point.payload as unknown as Record<string, unknown>,
      })),
    });
    return true;
  } catch (error) {
    console.error("Failed to upsert documentation chunks batch:", error);
    return false;
  }
};

export const deleteDocumentationVectorsBySource = async (
  documentationSourceId: string,
): Promise<boolean> => {
  try {
    await qdrantClient.delete(DOCUMENTATION_COLLECTION, {
      wait: true,
      filter: {
        must: [
          {
            key: "documentationSourceId",
            match: { value: documentationSourceId },
          },
        ],
      },
    });
    return true;
  } catch (error) {
    console.error(
      `Failed to delete documentation vectors for source ${documentationSourceId}:`,
      error,
    );
    return false;
  }
};
