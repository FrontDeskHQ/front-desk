import { google } from "@ai-sdk/google";
import type { InferLiveObject } from "@live-state/sync";
import { embed } from "ai";
import type { schema } from "api/schema";
import { summarizeThread } from "../pre-processors/summary";

const EMBEDDING_MODEL = "gemini-embedding-001";
const BATCH_CONCURRENCY = 5;

const embeddingModel = google.embedding(EMBEDDING_MODEL);

type Thread = InferLiveObject<
  typeof schema.thread,
  { messages: true; labels: { label: true } }
>;

export interface ThreadEmbeddingResult {
  threadId: string;
  summary: string;
  embedding: number[];
  success: true;
}

export interface ThreadEmbeddingError {
  threadId: string;
  error: string;
  success: false;
}

export type BatchEmbedResult = ThreadEmbeddingResult | ThreadEmbeddingError;

const generateEmbedding = async (text: string): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
      providerOptions: {
        google: {
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
    });

    const norm = Math.hypot(...embedding);

    if (!Number.isFinite(norm) || norm === 0) {
      console.warn("Embedding normalization failed: invalid norm", norm);
      return embedding;
    }

    return embedding.map((value) => value / norm);
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null;
  }
};

interface SummarizedThread {
  threadId: string;
  summary: string;
  success: true;
}

interface SummarizedThreadError {
  threadId: string;
  error: string;
  success: false;
}

type SummarizedThreadResult = SummarizedThread | SummarizedThreadError;

const summarizeSingleThread = async (
  thread: Thread,
): Promise<SummarizedThreadResult> => {
  try {
    const summary = await summarizeThread(thread);

    if (!summary || summary.trim().length === 0) {
      console.error(
        `Failed to generate summary for thread ${thread.id}: empty result`,
      );
      return {
        threadId: thread.id,
        error: "Failed to generate summary: empty result",
        success: false,
      };
    }

    return {
      threadId: thread.id,
      summary,
      success: true,
    };
  } catch (error) {
    console.error(`Failed to summarize thread ${thread.id}: ${error}`);
    return {
      threadId: thread.id,
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
};

const embedSingleSummary = async (
  summarized: SummarizedThread,
): Promise<BatchEmbedResult> => {
  console.log(`Embedding thread ${summarized.threadId}`);
  try {
    const embedding = await generateEmbedding(summarized.summary);

    if (!embedding) {
      console.error(
        `Failed to generate embedding for thread ${summarized.threadId}`,
      );
      return {
        threadId: summarized.threadId,
        error: "Failed to generate embedding",
        success: false,
      };
    }

    return {
      threadId: summarized.threadId,
      summary: summarized.summary,
      embedding,
      success: true,
    };
  } catch (error) {
    console.error(
      `Failed to embed thread ${summarized.threadId}: ${error}`,
    );
    return {
      threadId: summarized.threadId,
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
};

export const batchEmbedThread = async (
  threads: Thread[],
  options?: { concurrency?: number },
): Promise<BatchEmbedResult[]> => {
  const concurrency = options?.concurrency ?? BATCH_CONCURRENCY;

  if (threads.length === 0) {
    return [];
  }

  console.log(
    `Batch processing ${threads.length} threads with concurrency ${concurrency}`,
  );

  const results: BatchEmbedResult[] = [];
  const resultsMap = new Map<string, BatchEmbedResult>();

  // Process threads in batches with pipeline: summarize -> embed (while next batch summarizes)
  const totalBatches = Math.ceil(threads.length / concurrency);
  const embeddingPromises: Promise<void>[] = [];

  // Start first batch summarization
  let summarizePromise = Promise.all(
    threads.slice(0, concurrency).map((thread) => summarizeSingleThread(thread)),
  );

  for (let currentBatchIndex = 0; currentBatchIndex < totalBatches; currentBatchIndex++) {
    // Wait for current batch summaries to complete
    const summarizedResults = await summarizePromise;

    // Process successful summaries: embed them
    const successfulSummaries = summarizedResults.filter(
      (r): r is SummarizedThread => r.success === true,
    );

    // Add summarization errors to results
    for (const result of summarizedResults) {
      if (!result.success) {
        resultsMap.set(result.threadId, {
          threadId: result.threadId,
          error: result.error,
          success: false,
        });
      }
    }

    // Start embedding successful summaries from this batch
    if (successfulSummaries.length > 0) {
      const embeddingPromise = Promise.all(
        successfulSummaries.map((summarized) => embedSingleSummary(summarized)),
      ).then((embeddingResults) => {
        for (const result of embeddingResults) {
          resultsMap.set(result.threadId, result);
        }
      });
      embeddingPromises.push(embeddingPromise);
    }

    // Start next batch summarization (if there are more batches)
    const nextBatchIndex = currentBatchIndex + 1;
    if (nextBatchIndex < totalBatches) {
      const nextBatchStart = nextBatchIndex * concurrency;
      const nextBatch = threads.slice(
        nextBatchStart,
        nextBatchStart + concurrency,
      );
      summarizePromise = Promise.all(
        nextBatch.map((thread) => summarizeSingleThread(thread)),
      );
    }
  }

  // Wait for all embedding operations to complete
  await Promise.all(embeddingPromises);

  // Convert map to array, maintaining thread order
  for (const thread of threads) {
    const result = resultsMap.get(thread.id);
    if (result) {
      results.push(result);
    } else {
      // Fallback: should not happen, but handle gracefully
      results.push({
        threadId: thread.id,
        error: "Unknown error: result not found",
        success: false,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  console.log(
    `Batch processing complete: ${successCount} successful, ${errorCount} failed out of ${threads.length} threads`,
  );

  return results;
};
