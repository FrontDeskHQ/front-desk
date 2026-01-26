import { google } from "@ai-sdk/google";
import { embed } from "ai";
import { createHash } from "node:crypto";
import {
  type ThreadPayload,
  upsertThreadVector,
} from "../../lib/qdrant/threads";
import type { EmbedOutput, ParsedSummary, Thread } from "../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../core/types";
import { type SummarizeOutput, summarizeThread } from "./summarize";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);

/**
 * Compute SHA256 hash of input data
 */
const computeSha256 = (data: string): string => {
  return createHash("sha256").update(data).digest("hex");
};

/**
 * Create text representation from ParsedSummary for embedding
 */
const createSummaryText = (summary: ParsedSummary): string => {
  return Object.entries(summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .trim();
};

/**
 * Generate embedding vector from text
 */
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

    // Normalize the embedding vector
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
 * Embed processor
 *
 * Takes the summary from the summarize processor and generates embeddings,
 * then stores the vector in Qdrant.
 *
 * Dependencies: summarize
 */
export const embedProcessor: ProcessorDefinition<EmbedOutput> = {
  name: "embed",

  dependencies: ["summarize"],

  getIdempotencyKey(threadId: string): string {
    return `embed:${threadId}`;
  },

  computeHash(context: ProcessorExecuteContext): string {
    const { context: jobContext, threadId } = context;

    const summarizeOutput = jobContext.getProcessorOutput<SummarizeOutput>(
      "summarize",
      threadId,
    );

    if (!summarizeOutput) {
      return computeSha256("");
    }

    const { summary } = summarizeOutput;

    const hashInput = createSummaryText(summary);
    return computeSha256(hashInput);
  },

  async execute(
    context: ProcessorExecuteContext,
  ): Promise<ProcessorResult<EmbedOutput>> {
    const { context: jobContext, thread, threadId } = context;

    const summarizeOutput = jobContext.getProcessorOutput<SummarizeOutput>(
      "summarize",
      threadId,
    );

    if (!summarizeOutput) {
      return {
        threadId,
        success: false,
        error: "No summary available from summarize processor",
      };
    }

    const { summary } = summarizeOutput;

    try {
      console.log(`Embedding thread ${threadId}`);

      const summaryText = createSummaryText(summary);

      const embedding = await generateEmbedding(summaryText);

      if (!embedding) {
        return {
          threadId,
          success: false,
          error: "Failed to generate embedding",
        };
      }

      const payload = buildThreadPayload(thread, summary);
      const pointId = crypto.randomUUID();

      const storedInQdrant = await upsertThreadVector(
        pointId,
        embedding,
        payload,
      );

      if (!storedInQdrant) {
        console.warn(
          `Failed to store thread ${threadId} in Qdrant, but embedding was generated`,
        );
        return {
          threadId,
          success: false,
          error: "Failed to store thread vector in Qdrant",
          data: {
            embedding,
            summaryText,
            storedInQdrant,
          },
        } as ProcessorResult<EmbedOutput>;
      }

      return {
        threadId,
        success: true,
        data: {
          embedding,
          summaryText,
          storedInQdrant,
        },
      };
    } catch (error) {
      console.error(`Embed processor failed for thread ${threadId}:`, error);
      return {
        threadId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export interface BatchEmbedResult {
  threadId: string;
  embedding: number[];
  summary: string;
  success: true;
}

export interface BatchEmbedError {
  threadId: string;
  error: string;
  success: false;
}

export type BatchEmbedThreadResult = BatchEmbedResult | BatchEmbedError;

const DEFAULT_BATCH_CONCURRENCY = 5;

export const batchEmbedThread = async (
  threads: Thread[],
  options?: { concurrency?: number },
): Promise<BatchEmbedThreadResult[]> => {
  const concurrency = options?.concurrency ?? DEFAULT_BATCH_CONCURRENCY;

  if (threads.length === 0) {
    return [];
  }

  console.log(
    `Batch embedding ${threads.length} threads with concurrency ${concurrency}`,
  );

  const results: BatchEmbedThreadResult[] = [];

  for (let i = 0; i < threads.length; i += concurrency) {
    const batch = threads.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (thread): Promise<BatchEmbedThreadResult> => {
        try {
          const summary = await summarizeThread(thread);
          const summaryText = createSummaryText(summary);
          const embedding = await generateEmbedding(summaryText);

          if (!embedding) {
            return {
              threadId: thread.id,
              error: "Failed to generate embedding",
              success: false,
            };
          }

          return {
            threadId: thread.id,
            embedding,
            summary: summaryText,
            success: true,
          };
        } catch (error) {
          return {
            threadId: thread.id,
            error: error instanceof Error ? error.message : String(error),
            success: false,
          };
        }
      }),
    );

    results.push(...batchResults);
  }

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  console.log(
    `Batch embedding complete: ${successCount} successful, ${errorCount} failed out of ${threads.length} threads`,
  );

  return results;
};
