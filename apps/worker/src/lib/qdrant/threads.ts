import { log } from "@workspace/utils/logging";

import { errorFields } from "../logging";
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
      (c) => c.name === THREADS_COLLECTION
    );

    if (collectionExists) {
      return true;
    }

    await qdrantClient.createCollection(THREADS_COLLECTION, {
      optimizers_config: {
        indexing_threshold: 0,
      },
      vectors: {
        distance: "Cosine",
        size: EMBEDDING_DIMENSIONS,
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

    await qdrantClient.createPayloadIndex(THREADS_COLLECTION, {
      field_name: "threadId",
      field_schema: "keyword",
    });

    log.info({
      action: "worker.qdrant",
      operation: "collection.create",
      collection: THREADS_COLLECTION,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "collection.ensure",
      collection: THREADS_COLLECTION,
      error: errorFields(error),
    });
    return false;
  }
};

export const upsertThreadVector = async (
  pointId: string,
  vector: number[],
  payload: ThreadPayload
): Promise<boolean> => {
  try {
    await qdrantClient.upsert(THREADS_COLLECTION, {
      points: [
        {
          id: pointId,
          vector,
          payload: payload as unknown as Record<string, unknown>,
        },
      ],
      wait: true,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "thread_vector.upsert",
      collection: THREADS_COLLECTION,
      pointId,
      threadId: payload.threadId,
      organizationId: payload.organizationId,
      error: errorFields(error),
    });
    return false;
  }
};

export const deleteThreadVector = async (
  threadId: string
): Promise<boolean> => {
  try {
    const result = await getThreadVector(threadId);
    if (!result) {
      log.warn({
        action: "worker.qdrant",
        operation: "thread_vector.delete",
        collection: THREADS_COLLECTION,
        threadId,
        outcome: "not_found",
      });
      return false;
    }

    await qdrantClient.delete(THREADS_COLLECTION, {
      points: [result.pointId],
      wait: true,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "thread_vector.delete",
      collection: THREADS_COLLECTION,
      threadId,
      error: errorFields(error),
    });
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
  options: SimilarThreadSearchOptions
): Promise<SimilarThreadResult[]> => {
  const {
    organizationId,
    limit = 10,
    scoreThreshold = 0.7,
    excludeThreadIds = [],
    statusFilter,
  } = options;

  try {
    const mustConditions: {
      key: string;
      match?: { value: string | number } | { any: (string | number)[] };
      range?: { gte?: number; lte?: number };
    }[] = [{ key: "organizationId", match: { value: organizationId } }];

    if (statusFilter && statusFilter.length > 0) {
      mustConditions.push({ key: "status", match: { any: statusFilter } });
    }

    const mustNotConditions = excludeThreadIds.map((id) => ({
      key: "threadId",
      match: { value: id },
    }));

    const results = await qdrantClient.search(THREADS_COLLECTION, {
      filter: {
        must: mustConditions,
        must_not: mustNotConditions.length > 0 ? mustNotConditions : undefined,
      },
      limit,
      score_threshold: scoreThreshold,
      vector,
      with_payload: true,
    });

    return results.map((result) => ({
      payload: result.payload as unknown as ThreadPayload,
      score: result.score,
      threadId: (result.payload as unknown as ThreadPayload).threadId,
    }));
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "thread_vector.search",
      collection: THREADS_COLLECTION,
      organizationId,
      limit,
      scoreThreshold,
      statusFilter,
      error: errorFields(error),
    });
    return [];
  }
};

export const getThreadVector = async (
  threadId: string
): Promise<{
  vector: number[];
  payload: ThreadPayload;
  pointId: string;
} | null> => {
  try {
    const results = await qdrantClient.scroll(THREADS_COLLECTION, {
      filter: {
        must: [{ key: "threadId", match: { value: threadId } }],
      },
      limit: 1,
      with_payload: true,
      with_vector: true,
    });

    const point = results.points[0];
    if (!point) {
      return null;
    }

    return {
      payload: point.payload as unknown as ThreadPayload,
      pointId: typeof point.id === "string" ? point.id : String(point.id),
      vector: point.vector as number[],
    };
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "thread_vector.retrieve",
      collection: THREADS_COLLECTION,
      threadId,
      error: errorFields(error),
    });
    return null;
  }
};
