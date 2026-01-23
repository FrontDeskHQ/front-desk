import { qdrantClient } from "../../lib/qdrant/client";
import {
  THREADS_COLLECTION,
  type SimilarThreadResult,
  type ThreadPayload,
} from "../../lib/qdrant/threads";

export interface FindSimilarThreadsOptions {
  organizationId: string;
  limit?: number;
  scoreThreshold?: number;
  statusFilter?: number[];
}

export const batchFindSimilarThreads = async (
  threadIds: string[],
  options: FindSimilarThreadsOptions,
): Promise<Map<string, SimilarThreadResult[]>> => {
  const { organizationId, limit = 10, scoreThreshold = 0.7, statusFilter } = options;
  const results = new Map<string, SimilarThreadResult[]>();

  if (threadIds.length === 0) {
    return results;
  }

  const mustConditions: Array<{ key: string; match: { value: string | number } }> = [
    { key: "organizationId", match: { value: organizationId } },
  ];

  if (statusFilter) {
    for (const status of statusFilter) {
      mustConditions.push({ key: "status", match: { value: status } });
    }
  }

  await Promise.all(
    threadIds.map(async (threadId) => {
      const scrollResult = await qdrantClient.scroll(THREADS_COLLECTION, {
        filter: {
          must: [{ key: "threadId", match: { value: threadId } }],
        },
        limit: 1,
        with_vector: true,
        with_payload: true,
      });

      const point = scrollResult.points[0];
      if (!point) {
        results.set(threadId, []);
        return;
      }

      const vector = point.vector as number[];
      if (!vector) {
        results.set(threadId, []);
        return;
      }

      const searchResults = await qdrantClient.search(THREADS_COLLECTION, {
        vector,
        limit: limit + 1,
        score_threshold: scoreThreshold,
        filter: {
          must: mustConditions,
          must_not: [{ key: "threadId", match: { value: threadId } }],
        },
        with_payload: true,
      });

      results.set(
        threadId,
        searchResults.slice(0, limit).map((r) => ({
          threadId: (r.payload as unknown as ThreadPayload).threadId,
          score: r.score,
          payload: r.payload as unknown as ThreadPayload,
        })),
      );
    }),
  );

  return results;
};
