import { createHash } from "node:crypto";

import { google } from "@ai-sdk/google";
import { createAILogger, createLogger } from "@workspace/utils/logging";
import { embed } from "ai";

import { AI_PRICING } from "../../lib/ai-pricing";
import { isRetryableError } from "../../lib/logging";
import type { WorkerLogger } from "../../lib/logging";
import { threadIndex } from "../../lib/qdrant/threads";
import type { ThreadPayload } from "../../lib/qdrant/threads";
import type { EmbedOutput, ParsedSummary, Thread } from "../../types";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../core/types";
import { summarizeThread } from "./summarize";
import type { SummarizeOutput } from "./summarize";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);

/**
 * Compute SHA256 hash of input data
 */
const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Create text representation from ParsedSummary for embedding
 */
const createSummaryText = (summary: ParsedSummary): string =>
  Object.entries(summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .trim();

/**
 * Generate embedding vector from text
 */
const generateEmbedding = async (
  text: string,
  ai?: ReturnType<typeof createAILogger>,
  requestLog?: WorkerLogger
): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const { embedding, usage } = await embed({
      model: embeddingModel,
      providerOptions: {
        google: {
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
      value: text,
    });
    ai?.captureEmbed({
      count: 1,
      dimensions: embedding.length,
      model: EMBEDDING_MODEL,
      usage,
    });

    // Normalize the embedding vector
    const norm = Math.hypot(...embedding);

    if (!Number.isFinite(norm) || norm === 0) {
      requestLog?.warn(
        "Thread embedding normalization produced an invalid norm",
        {
          embedding: { dimensions: embedding.length, norm },
          step: "normalize_embedding",
        }
      );
      return embedding;
    }

    return embedding.map((value) => value / norm);
  } catch (error) {
    requestLog?.error(error instanceof Error ? error : String(error), {
      retryable: isRetryableError(error),
      step: "generate_thread_embedding",
    });
    return null;
  }
};

/**
 * Build ThreadPayload from thread data and parsed summary
 */
const buildThreadPayload = (
  thread: Thread,
  parsedSummary: ParsedSummary
): ThreadPayload => {
  const labelNames =
    thread.labels
      ?.map((threadLabel) => threadLabel.label?.name)
      .filter((label): label is string => Boolean(label)) ?? [];

  const createdAt = thread.createdAt?.getTime?.() ?? Date.now();

  return {
    assignedUserId: thread.assignedUserId ?? null,
    authorId: thread.authorId ?? "",
    createdAt,
    entities: parsedSummary.entities,
    expectedAction: parsedSummary.expectedAction || "triage",
    keywords: parsedSummary.keywords,
    labels: labelNames,
    organizationId: thread.organizationId,
    priority: thread.priority ?? 0,
    shortDescription:
      parsedSummary.shortDescription ||
      thread.messages?.[0]?.content ||
      "No summary available.",
    status: thread.status ?? 0,
    threadId: thread.id,
    title: parsedSummary.title || thread.name || "Untitled",
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
  computeHash(context: ProcessorExecuteContext): string {
    const { context: jobContext, threadId } = context;

    const summarizeOutput = jobContext.getProcessorOutput<SummarizeOutput>(
      "summarize",
      threadId
    );

    // The collection name is part of the hash so that rolling the index to a new
    // version invalidates every thread's idempotency key. Without it, a thread
    // whose summary has not changed would skip `embed` forever and never be
    // written to the new collection — the idempotency record lives in Postgres
    // and survives the roll. This does not repopulate dormant threads, which
    // receive no pipeline run at all; that needs a backfill.
    const collection = threadIndex.name;

    if (!summarizeOutput) {
      return computeSha256(collection);
    }

    const { summary } = summarizeOutput;

    return computeSha256(`${collection}|${createSummaryText(summary)}`);
  },

  dependencies: ["summarize"],

  async execute(
    context: ProcessorExecuteContext
  ): Promise<ProcessorResult<EmbedOutput>> {
    const { context: jobContext, thread, threadId } = context;
    const requestLog = createLogger({
      action: "pipeline.embed",
      processor: "embed",
      threadId,
      organizationId: thread.organizationId,
      jobId: jobContext.jobId,
    });
    const ai = createAILogger(requestLog, { cost: AI_PRICING });
    let status = 200;

    const summarizeOutput = jobContext.getProcessorOutput<SummarizeOutput>(
      "summarize",
      threadId
    );

    if (!summarizeOutput) {
      status = 500;
      requestLog.set({
        outcome: { status: "failed", reason: "summary_missing" },
      });
      requestLog.emit({ status });
      return {
        threadId,
        success: false,
        error: "No summary available from summarize processor",
      };
    }

    const { summary } = summarizeOutput;

    try {
      requestLog.set({
        input: {
          summaryPresent: true,
          summaryFieldCount: Object.keys(summary).length,
        },
      });

      const summaryText = createSummaryText(summary);

      const embedding = await generateEmbedding(summaryText, ai, requestLog);

      if (!embedding) {
        status = 500;
        requestLog.set({
          outcome: { status: "failed", reason: "embedding_generation_failed" },
        });
        return {
          threadId,
          success: false,
          error: "Failed to generate embedding",
        };
      }

      const payload = buildThreadPayload(thread, summary);

      // Point identity is derived from (organizationId, threadId) by the index,
      // so a re-embed overwrites the thread's point instead of adding another.
      let storedInQdrant = true;
      try {
        await threadIndex.upsert({ payload, vector: embedding });
      } catch (storeError) {
        storedInQdrant = false;
        requestLog.warn("Thread vector upsert failed", {
          error: String(storeError),
          step: "store_thread_vector",
        });
      }

      if (!storedInQdrant) {
        status = 500;
        requestLog.warn(
          "Thread embedding was generated but Qdrant storage failed",
          {
            embedding: { dimensions: embedding.length },
            step: "store_thread_vector",
          }
        );
        requestLog.set({
          outcome: { status: "failed", reason: "thread_vector_upsert_failed" },
        });
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

      requestLog.set({
        outcome: {
          status: "completed",
          embeddingDimensions: embedding.length,
          storedInQdrant: true,
        },
      });
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
      status = 500;
      requestLog.error(error instanceof Error ? error : String(error), {
        retryable: true,
        step: "embed_thread",
      });
      requestLog.set({ outcome: { status: "failed" } });
      return {
        threadId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      requestLog.emit({ status });
    }
  },

  getIdempotencyKey(threadId: string): string {
    return `embed:${threadId}`;
  },

  name: "embed",
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
  options?: { concurrency?: number }
): Promise<BatchEmbedThreadResult[]> => {
  const concurrency = options?.concurrency ?? DEFAULT_BATCH_CONCURRENCY;

  if (threads.length === 0) {
    return [];
  }

  const batchLog = createLogger({
    action: "worker.batch_embed",
    operation: "thread.embed.batch",
    input: { threadCount: threads.length, concurrency },
  });

  const results: BatchEmbedThreadResult[] = [];

  for (let i = 0; i < threads.length; i += concurrency) {
    const batch = threads.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (thread): Promise<BatchEmbedThreadResult> => {
        const threadLog = createLogger({
          action: "worker.batch_embed.item",
          operation: "thread.embed",
          threadId: thread.id,
        });
        const ai = createAILogger(threadLog, { cost: AI_PRICING });
        let status = 200;

        try {
          const summary = await summarizeThread(thread, ai, threadLog);
          const summaryText = createSummaryText(summary);
          const embedding = await generateEmbedding(summaryText, ai, threadLog);

          if (!embedding) {
            status = 500;
            threadLog.set({
              outcome: {
                status: "failed",
                reason: "embedding_generation_failed",
              },
            });
            return {
              error: "Failed to generate embedding",
              success: false,
              threadId: thread.id,
            };
          }

          threadLog.set({
            outcome: {
              status: "completed",
              embeddingDimensions: embedding.length,
            },
          });
          return {
            embedding,
            success: true,
            summary: summaryText,
            threadId: thread.id,
          };
        } catch (error) {
          status = 500;
          threadLog.error(error instanceof Error ? error : String(error), {
            retryable: isRetryableError(error),
            step: "batch_embed_thread",
          });
          threadLog.set({ outcome: { status: "failed" } });
          return {
            error: error instanceof Error ? error.message : String(error),
            success: false,
            threadId: thread.id,
          };
        } finally {
          threadLog.emit({ status });
        }
      })
    );

    results.push(...batchResults);
  }

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  batchLog.set({
    outcome: {
      status: errorCount > 0 ? "completed_with_errors" : "completed",
      successCount,
      errorCount,
      threadCount: threads.length,
    },
  });
  batchLog.emit({ status: errorCount > 0 ? 207 : 200 });

  return results;
};
