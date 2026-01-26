import { storeSuggestion } from "../../lib/database/client";
import { qdrantClient } from "../../lib/qdrant/client";
import {
  type SimilarThreadResult,
  THREADS_COLLECTION,
  type ThreadPayload,
} from "../../lib/qdrant/threads";
import type { PostProcessorInput, PostProcessorResult } from "../../types";

export interface FindSimilarThreadsOptions {
  organizationId: string;
  limit?: number;
  scoreThreshold?: number;
  statusFilter?: number[];
}

export interface BatchFindSimilarResult {
  threadId: string;
  similarThreads: SimilarThreadResult[];
  storedInSuggestions: boolean;
  success: true;
}

export interface BatchFindSimilarError {
  threadId: string;
  error: string;
  success: false;
}

export type BatchFindResult = BatchFindSimilarResult | BatchFindSimilarError;

/**
 * Find similar threads for a single thread and store results in suggestions table
 */
export const findAndStoreSimilarThreads = async (
  input: PostProcessorInput,
  options?: {
    limit?: number;
    scoreThreshold?: number;
    statusFilter?: number[];
  },
): Promise<PostProcessorResult> => {
  const { threadId, organizationId, embedding } = input;
  const { limit = 10, scoreThreshold = 0.7, statusFilter } = options ?? {};

  try {
    // Build filter conditions
    const mustConditions: Array<{
      key: string;
      match: { value: string | number };
    }> = [{ key: "organizationId", match: { value: organizationId } }];

    if (statusFilter) {
      for (const status of statusFilter) {
        mustConditions.push({ key: "status", match: { value: status } });
      }
    }

    // Search for similar threads using the embedding
    const searchResults = await qdrantClient.search(THREADS_COLLECTION, {
      vector: embedding,
      limit: limit + 1, // +1 to account for self-match exclusion
      score_threshold: scoreThreshold,
      filter: {
        must: mustConditions,
        must_not: [{ key: "threadId", match: { value: threadId } }],
      },
      with_payload: true,
    });

    const similarThreads: SimilarThreadResult[] = searchResults
      .slice(0, limit)
      .map((r) => ({
        threadId: (r.payload as unknown as ThreadPayload).threadId,
        score: r.score,
        payload: r.payload as unknown as ThreadPayload,
      }));

    // Store results in suggestions table
    const storedInSuggestions = await storeSuggestion({
      threadId,
      organizationId,
      similarThreads,
      metadata: {
        limit,
        scoreThreshold,
        statusFilter,
        timestamp: Date.now(),
      },
    });

    if (!storedInSuggestions) {
      console.warn(
        `Failed to store suggestions for thread ${threadId}, but similar threads were found`,
      );
    }

    return {
      threadId,
      success: true,
      data: {
        similarThreads,
        storedInSuggestions,
      },
    };
  } catch (error) {
    console.error(`Failed to find similar threads for ${threadId}:`, error);
    return {
      threadId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Batch find similar threads and store results in suggestions table
 */
export const batchFindAndStoreSimilarThreads = async (
  inputs: PostProcessorInput[],
  options?: {
    limit?: number;
    scoreThreshold?: number;
    statusFilter?: number[];
  },
): Promise<BatchFindResult[]> => {
  if (inputs.length === 0) {
    return [];
  }

  console.log(`Finding similar threads for ${inputs.length} threads`);

  const results = await Promise.all(
    inputs.map(async (input) => {
      const result = await findAndStoreSimilarThreads(input, options);

      if (result.success) {
        return {
          threadId: result.threadId,
          similarThreads: result.data.similarThreads,
          storedInSuggestions: result.data.storedInSuggestions,
          success: true as const,
        };
      }

      return {
        threadId: result.threadId,
        error: result.error,
        success: false as const,
      };
    }),
  );

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  console.log(
    `Similar threads search complete: ${successCount} successful, ${errorCount} failed out of ${inputs.length} threads`,
  );

  return results;
};
