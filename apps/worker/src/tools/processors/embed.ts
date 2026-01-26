import { google } from "@ai-sdk/google";
import { embed } from "ai";
import {
  type ThreadPayload,
  upsertThreadVector,
} from "../../lib/qdrant/threads";
import type {
  ParsedSummary,
  ProcessorInput,
  ProcessorResult,
  Thread,
} from "../../types";

const EMBEDDING_MODEL = "gemini-embedding-001";
const BATCH_CONCURRENCY = 5;

const embeddingModel = google.embedding(EMBEDDING_MODEL);

export interface ThreadEmbeddingResult {
  threadId: string;
  summary: string;
  embedding: number[];
  storedInQdrant: boolean;
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

/**
 * Build ThreadPayload from thread data and parsed summary
 */
const buildThreadPayload = (
  thread: Thread,
  parsedSummary: ParsedSummary,
): ThreadPayload => {
  const labelNames =
    thread.labels
      ?.map((threadLabel) => threadLabel.label?.name)
      .filter((label): label is string => Boolean(label)) ?? [];

  const createdAt = thread.createdAt?.getTime?.() ?? Date.now();

  return {
    threadId: thread.id,
    organizationId: thread.organizationId,
    title: parsedSummary.title || thread.name || "Untitled",
    shortDescription:
      parsedSummary.shortDescription ||
      thread.messages?.[0]?.content ||
      "No summary available.",
    keywords: parsedSummary.keywords,
    entities: parsedSummary.entities,
    expectedAction: parsedSummary.expectedAction || "triage",
    status: thread.status ?? 0,
    priority: thread.priority ?? 0,
    authorId: thread.authorId ?? "",
    assignedUserId: thread.assignedUserId ?? null,
    labels: labelNames,
    createdAt,
    updatedAt: Date.now(),
  };
};

/**
 * Create a string representation from ParsedSummary for embedding generation
 */
const createSummaryText = (summary: ParsedSummary): string => {
  return `${summary.title}\n\n${summary.shortDescription}`.trim();
};

/**
 * Process a single thread: generate embedding and store in Qdrant
 */
export const embedAndStoreThread = async (
  input: ProcessorInput,
): Promise<ProcessorResult> => {
  const { threadId, thread, summary } = input;

  console.log(`Embedding thread ${threadId}`);

  try {
    // Create text representation for embedding generation
    const summaryText = createSummaryText(summary);

    // Generate embedding from summary text
    const embedding = await generateEmbedding(summaryText);

    if (!embedding) {
      console.error(`Failed to generate embedding for thread ${threadId}`);
      return {
        threadId,
        success: false,
        error: "Failed to generate embedding",
      };
    }

    // Build ThreadPayload using ParsedSummary directly
    const payload = buildThreadPayload(thread, summary);

    // Generate a unique point ID for Qdrant
    const pointId = crypto.randomUUID();

    // Upsert to Qdrant
    const storedInQdrant = await upsertThreadVector(
      pointId,
      embedding,
      payload,
    );

    if (!storedInQdrant) {
      console.warn(
        `Failed to store thread ${threadId} in Qdrant, but embedding was generated`,
      );
    }

    // Serialize ParsedSummary to string for EmbedOutput
    const summaryString = JSON.stringify(summary);

    return {
      threadId,
      success: true,
      data: {
        embedding,
        summary: summaryString,
        storedInQdrant,
      },
    };
  } catch (error) {
    console.error(`Failed to embed thread ${threadId}:`, error);
    return {
      threadId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

interface SummaryInput {
  threadId: string;
  thread: Thread;
  summary: ParsedSummary;
}

/**
 * Batch process threads: generate embeddings and store in Qdrant
 * This function takes pre-computed summaries (from the pre-processor stage)
 */
export const batchEmbedAndStore = async (
  inputs: SummaryInput[],
  options?: { concurrency?: number },
): Promise<BatchEmbedResult[]> => {
  const concurrency = options?.concurrency ?? BATCH_CONCURRENCY;

  if (inputs.length === 0) {
    return [];
  }

  console.log(
    `Batch embedding ${inputs.length} threads with concurrency ${concurrency}`,
  );

  const results: BatchEmbedResult[] = [];
  const resultsMap = new Map<string, BatchEmbedResult>();

  // Process in batches
  const totalBatches = Math.ceil(inputs.length / concurrency);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * concurrency;
    const batch = inputs.slice(batchStart, batchStart + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (input) => {
        const result = await embedAndStoreThread(input);

        if (result.success) {
          return {
            threadId: result.threadId,
            summary: result.data.summary,
            embedding: result.data.embedding,
            storedInQdrant: result.data.storedInQdrant,
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

    for (const result of batchResults) {
      resultsMap.set(result.threadId, result);
    }
  }

  // Convert map to array, maintaining input order
  for (const input of inputs) {
    const result = resultsMap.get(input.threadId);
    if (result) {
      results.push(result);
    } else {
      results.push({
        threadId: input.threadId,
        error: "Unknown error: result not found",
        success: false,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  console.log(
    `Batch embedding complete: ${successCount} successful, ${errorCount} failed out of ${inputs.length} threads`,
  );

  return results;
};
