import { createHash } from "node:crypto";

import { google } from "@ai-sdk/google";
import { createAILogger, createLogger } from "@workspace/utils/logging";
import { embed } from "ai";

import { AI_PRICING } from "../../lib/ai-pricing";
import { upsertThreadVector } from "../../lib/qdrant/threads";
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
  ai?: ReturnType<typeof createAILogger>
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

    if (!summarizeOutput) {
      return computeSha256("");
    }

    const { summary } = summarizeOutput;

    const hashInput = createSummaryText(summary);
    return computeSha256(hashInput);
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
      requestLog.emit({ status });
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

      const embedding = await generateEmbedding(summaryText, ai);

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
        payload
      );

      if (!storedInQdrant) {
        console.warn(
          `Failed to store thread ${threadId} in Qdrant, but embedding was generated`
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
      status = 500;
      console.error(`Embed processor failed for thread ${threadId}:`, error);
      requestLog.error(
        `Embed failed for thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`
      );
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

  console.log(
    `Batch embedding ${threads.length} threads with concurrency ${concurrency}`
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
              error: "Failed to generate embedding",
              success: false,
              threadId: thread.id,
            };
          }

          return {
            embedding,
            success: true,
            summary: summaryText,
            threadId: thread.id,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            success: false,
            threadId: thread.id,
          };
        }
      })
    );

    results.push(...batchResults);
  }

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  console.log(
    `Batch embedding complete: ${successCount} successful, ${errorCount} failed out of ${threads.length} threads`
  );

  return results;
};
