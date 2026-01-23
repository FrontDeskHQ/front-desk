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

const embedSingleThread = async (thread: Thread): Promise<BatchEmbedResult> => {
  try {
    const summary = await summarizeThread(thread);

    if (!summary || summary.trim().length === 0) {
      return {
        threadId: thread.id,
        error: "Failed to generate summary: empty result",
        success: false,
      };
    }

    const embedding = await generateEmbedding(summary);

    if (!embedding) {
      return {
        threadId: thread.id,
        error: "Failed to generate embedding",
        success: false,
      };
    }

    return {
      threadId: thread.id,
      summary,
      embedding,
      success: true,
    };
  } catch (error) {
    return {
      threadId: thread.id,
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
};

const processBatch = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
};

export const batchEmbedThread = async (
  threads: Thread[],
  options?: { concurrency?: number },
): Promise<BatchEmbedResult[]> => {
  const concurrency = options?.concurrency ?? BATCH_CONCURRENCY;

  if (threads.length === 0) {
    return [];
  }

  const results = await processBatch(threads, embedSingleThread, concurrency);

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  console.log(
    `Batch embedding complete: ${successCount} successful, ${errorCount} failed out of ${threads.length} threads`,
  );

  return results;
};
