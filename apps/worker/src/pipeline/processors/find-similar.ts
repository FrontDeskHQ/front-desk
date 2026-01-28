import { createHash } from "node:crypto";
import { storeSuggestion } from "../../lib/database/client";
import { qdrantClient } from "../../lib/qdrant/client";
import {
  type SimilarThreadResult,
  THREADS_COLLECTION,
  type ThreadPayload,
} from "../../lib/qdrant/threads";
import type { EmbedOutput } from "../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../core/types";

const DEFAULT_SIMILAR_THREADS_LIMIT = 5;
const DEFAULT_SCORE_THRESHOLD = 0.7;

/**
 * Output type for the find-similar processor
 */
export interface FindSimilarOutput {
  similarThreads: SimilarThreadResult[];
  storedInSuggestions: boolean;
}

/**
 * Compute SHA256 hash of input data
 */
const computeSha256 = (data: string): string => {
  return createHash("sha256").update(data).digest("hex");
};

/**
 * Find-similar processor
 *
 * Takes the embedding from the embed processor and searches for similar threads
 * in Qdrant, then stores the results as suggestions.
 *
 * Dependencies: embed
 */
export const findSimilarProcessor: ProcessorDefinition<FindSimilarOutput> = {
  name: "find-similar",

  dependencies: ["embed"],

  getIdempotencyKey(threadId: string): string {
    return `find-similar:${threadId}`;
  },

  computeHash(context: ProcessorExecuteContext): string {
    const { context: jobContext, threadId } = context;

    // Get the embed output from the embed processor
    const embedOutput = jobContext.getProcessorOutput<EmbedOutput>(
      "embed",
      threadId,
    );

    if (!embedOutput) {
      return computeSha256("");
    }

    const limit =
      jobContext.options?.similarThreadsLimit ?? DEFAULT_SIMILAR_THREADS_LIMIT;
    const scoreThreshold =
      jobContext.options?.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;

    // First 50 values should be enough to identify any changes in the embeddings
    const embeddingString = embedOutput.embedding.slice(0, 50).join(",");
    const hashInput = `${embeddingString}|limit:${limit}|scoreThreshold:${scoreThreshold}`;
    return computeSha256(hashInput);
  },

  async execute(
    context: ProcessorExecuteContext,
  ): Promise<ProcessorResult<FindSimilarOutput>> {
    const { context: jobContext, thread, threadId } = context;

    const embedOutput = jobContext.getProcessorOutput<EmbedOutput>(
      "embed",
      threadId,
    );

    if (!embedOutput) {
      return {
        threadId,
        success: false,
        error: "No embedding available from embed processor",
      };
    }

    const { embedding } = embedOutput;
    const organizationId = thread.organizationId;

    const limit =
      jobContext.options?.similarThreadsLimit ?? DEFAULT_SIMILAR_THREADS_LIMIT;
    const scoreThreshold =
      jobContext.options?.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;

    try {
      console.log(`Finding similar threads for ${threadId}`);

      const mustConditions: Array<{
        key: string;
        match: { value: string | number };
      }> = [{ key: "organizationId", match: { value: organizationId } }];

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
          timestamp: Date.now(),
        },
      });

      if (!storedInSuggestions) {
        console.error(`Failed to store suggestions for thread ${threadId}`);
        return {
          threadId,
          success: false,
          error: "Failed to store suggestions",
        };
      }

      console.log(
        `Found ${similarThreads.length} similar threads for ${threadId}`,
      );

      return {
        threadId,
        success: true,
        data: {
          similarThreads,
          storedInSuggestions,
        },
      };
    } catch (error) {
      console.error(
        `Find-similar processor failed for thread ${threadId}:`,
        error,
      );
      return {
        threadId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export interface FindSimilarOptions {
  organizationId: string;
  limit?: number;
  scoreThreshold?: number;
}

export const batchFindSimilarThreads = async (
  threadIds: string[],
  options: FindSimilarOptions,
): Promise<Map<string, Array<{ threadId: string; score: number }>>> => {
  const { organizationId, limit = 10, scoreThreshold = 0.7 } = options;
  const results = new Map<string, Array<{ threadId: string; score: number }>>();

  if (threadIds.length === 0) {
    return results;
  }

  console.log(`Finding similar threads for ${threadIds.length} threads`);

  for (const threadId of threadIds) {
    try {
      // First get the thread's embedding from Qdrant
      const existingPoints = await qdrantClient.scroll(THREADS_COLLECTION, {
        filter: {
          must: [
            { key: "threadId", match: { value: threadId } },
            { key: "organizationId", match: { value: organizationId } },
          ],
        },
        limit: 1,
        with_vector: true,
        with_payload: true,
      });

      if (existingPoints.points.length === 0) {
        console.warn(`No embedding found for thread ${threadId}`);
        results.set(threadId, []);
        continue;
      }

      const point = existingPoints.points[0];
      if (!point) {
        results.set(threadId, []);
        continue;
      }

      const embedding = point.vector as number[];

      const mustConditions: Array<{
        key: string;
        match: { value: string | number };
      }> = [{ key: "organizationId", match: { value: organizationId } }];

      const searchResults = await qdrantClient.search(THREADS_COLLECTION, {
        vector: embedding,
        limit: limit + 1,
        score_threshold: scoreThreshold,
        filter: {
          must: mustConditions,
          must_not: [{ key: "threadId", match: { value: threadId } }],
        },
        with_payload: true,
      });

      const similarThreads = searchResults.slice(0, limit).map((r) => ({
        threadId: (r.payload as unknown as ThreadPayload).threadId,
        score: r.score,
      }));

      results.set(threadId, similarThreads);
    } catch (error) {
      console.error(`Failed to find similar threads for ${threadId}:`, error);
      results.set(threadId, []);
    }
  }

  return results;
};
