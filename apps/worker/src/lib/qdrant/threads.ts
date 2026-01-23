import { qdrantClient } from "./client";

export const THREADS_COLLECTION = "threads-v1";
export const EMBEDDING_DIMENSIONS = 3072;

export interface ThreadPayload {
  threadId: string;
  organizationId: string;
  title: string;
  shortDescription: string;
  keywords: string[];
  entities: string[];
  expectedAction: string;
  status: number;
  priority: number;
  authorId: string;
  assignedUserId: string | null;
  labels: string[];
  createdAt: number;
  updatedAt: number;
}

export const ensureThreadsCollection = async (): Promise<boolean> => {
  try {
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (c) => c.name === THREADS_COLLECTION,
    );

    if (collectionExists) {
      return true;
    }

    await qdrantClient.createCollection(THREADS_COLLECTION, {
      vectors: {
        size: EMBEDDING_DIMENSIONS,
        distance: "Cosine",
      },
      optimizers_config: {
        indexing_threshold: 0,
      },
    });

    await qdrantClient.createPayloadIndex(THREADS_COLLECTION, {
      field_name: "organizationId",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(THREADS_COLLECTION, {
      field_name: "status",
      field_schema: "integer",
    });

    await qdrantClient.createPayloadIndex(THREADS_COLLECTION, {
      field_name: "priority",
      field_schema: "integer",
    });

    await qdrantClient.createPayloadIndex(THREADS_COLLECTION, {
      field_name: "keywords",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(THREADS_COLLECTION, {
      field_name: "labels",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(THREADS_COLLECTION, {
      field_name: "createdAt",
      field_schema: "integer",
    });

    console.log(`Created Qdrant collection: ${THREADS_COLLECTION}`);
    return true;
  } catch (error) {
    console.error("Failed to ensure threads collection:", error);
    return false;
  }
};

export const upsertThreadVector = async (
  id: string,
  vector: number[],
  payload: ThreadPayload,
): Promise<boolean> => {
  try {
    await qdrantClient.upsert(THREADS_COLLECTION, {
      wait: true,
      points: [
        {
          id,
          vector,
          payload: payload as unknown as Record<string, unknown>,
        },
      ],
    });
    return true;
  } catch (error) {
    console.error(`Failed to upsert thread vector ${id}:`, error);
    return false;
  }
};

export const deleteThreadVector = async (id: string): Promise<boolean> => {
  try {
    await qdrantClient.delete(THREADS_COLLECTION, {
      wait: true,
      points: [id],
    });
    return true;
  } catch (error) {
    console.error(`Failed to delete thread vector ${id}:`, error);
    return false;
  }
};

export interface SimilarThreadSearchOptions {
  organizationId: string;
  limit?: number;
  scoreThreshold?: number;
  excludeThreadIds?: string[];
  statusFilter?: number[];
}

export interface SimilarThreadResult {
  threadId: string;
  score: number;
  payload: ThreadPayload;
}

export const searchSimilarThreads = async (
  vector: number[],
  options: SimilarThreadSearchOptions,
): Promise<SimilarThreadResult[]> => {
  const {
    organizationId,
    limit = 10,
    scoreThreshold = 0.7,
    excludeThreadIds = [],
    statusFilter,
  } = options;

  try {
    const mustConditions: Array<{
      key: string;
      match?: { value: string | number };
      range?: { gte?: number; lte?: number };
    }> = [{ key: "organizationId", match: { value: organizationId } }];

    if (statusFilter && statusFilter.length > 0) {
      for (const status of statusFilter) {
        mustConditions.push({ key: "status", match: { value: status } });
      }
    }

    const mustNotConditions = excludeThreadIds.map((id) => ({
      key: "threadId",
      match: { value: id },
    }));

    const results = await qdrantClient.search(THREADS_COLLECTION, {
      vector,
      limit,
      score_threshold: scoreThreshold,
      filter: {
        must: mustConditions,
        must_not: mustNotConditions.length > 0 ? mustNotConditions : undefined,
      },
      with_payload: true,
    });

    return results.map((result) => ({
      threadId: (result.payload as unknown as ThreadPayload).threadId,
      score: result.score,
      payload: result.payload as unknown as ThreadPayload,
    }));
  } catch (error) {
    console.error("Failed to search similar threads:", error);
    return [];
  }
};

export const getThreadVector = async (
  id: string,
): Promise<{ vector: number[]; payload: ThreadPayload } | null> => {
  try {
    const results = await qdrantClient.retrieve(THREADS_COLLECTION, {
      ids: [id],
      with_vector: true,
      with_payload: true,
    });

    const point = results[0];
    if (!point) {
      return null;
    }

    return {
      vector: point.vector as number[],
      payload: point.payload as unknown as ThreadPayload,
    };
  } catch (error) {
    console.error(`Failed to get thread vector ${id}:`, error);
    return null;
  }
};
