import { log } from "@workspace/utils/logging";

import { errorFields } from "../logging";
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
      (c) => c.name === DOCUMENTATION_COLLECTION
    );

    if (collectionExists) {
      return true;
    }

    await qdrantClient.createCollection(DOCUMENTATION_COLLECTION, {
      optimizers_config: {
        indexing_threshold: 0,
      },
      sparse_vectors: {
        bm25: { modifier: "idf" },
      },
      vectors: {
        dense: {
          distance: "Cosine",
          size: DOCUMENTATION_EMBEDDING_DIMENSIONS,
        },
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

    log.info({
      action: "worker.qdrant",
      operation: "collection.create",
      collection: DOCUMENTATION_COLLECTION,
      embeddingDimensions: DOCUMENTATION_EMBEDDING_DIMENSIONS,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "collection.ensure",
      collection: DOCUMENTATION_COLLECTION,
      error: errorFields(error),
    });
    return false;
  }
};

export const upsertDocumentationChunksBatch = async (
  points: {
    id: string;
    vector: {
      dense: number[];
      bm25: { text: string; model: "qdrant/bm25" };
    };
    payload: DocumentationChunkPayload;
  }[]
): Promise<boolean> => {
  try {
    await qdrantClient.upsert(DOCUMENTATION_COLLECTION, {
      points: points.map((point) => ({
        id: point.id,
        vector: point.vector,
        payload: point.payload as unknown as Record<string, unknown>,
      })),
      wait: true,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "documentation_chunks.upsert",
      collection: DOCUMENTATION_COLLECTION,
      pointCount: points.length,
      error: errorFields(error),
    });
    return false;
  }
};

export const deleteDocumentationVectorsBySource = async (
  documentationSourceId: string
): Promise<boolean> => {
  try {
    await qdrantClient.delete(DOCUMENTATION_COLLECTION, {
      filter: {
        must: [
          {
            key: "documentationSourceId",
            match: { value: documentationSourceId },
          },
        ],
      },
      wait: true,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "documentation_vectors.delete_by_source",
      collection: DOCUMENTATION_COLLECTION,
      documentationSourceId,
      error: errorFields(error),
    });
    return false;
  }
};
