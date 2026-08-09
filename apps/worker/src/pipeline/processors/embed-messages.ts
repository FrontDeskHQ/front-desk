import { createHash } from "node:crypto";

import { google } from "@ai-sdk/google";
import { createAILogger, createLogger } from "@workspace/utils/logging";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { embed } from "ai";
import { AI_PRICING } from "../../lib/ai-pricing";
import { isRetryableError } from "../../lib/logging";
import type { WorkerLogger } from "../../lib/logging";
import { messageIndex } from "../../lib/qdrant/messages";
import type { MessagePayload } from "../../lib/qdrant/messages";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../core/types";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);
const DEFAULT_BATCH_CONCURRENCY = 5;

export interface EmbedMessagesOutput {
  embeddedCount: number;
  skippedCount: number;
}

/**
 * Compute SHA256 hash of input data
 */
const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Generate dense embedding vector (3072-dim) for a message
 */
const generateMessageEmbedding = async (
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
          taskType: "RETRIEVAL_DOCUMENT",
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

    const norm = Math.hypot(...embedding);

    if (!Number.isFinite(norm) || norm === 0) {
      requestLog?.warn(
        "Message embedding normalization produced an invalid norm",
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
      step: "generate_message_embedding",
    });
    return null;
  }
};

/**
 * Embed-messages processor
 *
 * Embeds all messages in a thread into Qdrant for hybrid search.
 * Runs in Turn 1 (no dependencies), parallel with summarize.
 */
export const embedMessagesProcessor: ProcessorDefinition<EmbedMessagesOutput> =
  {
    computeHash(context: ProcessorExecuteContext): string {
      const messages = context.thread.messages ?? [];
      const sorted = [...messages].toSorted((a, b) => a.id.localeCompare(b.id));
      // Collection name included for the same reason as `embed` — rolling the
      // index must invalidate idempotency keys that outlive the collection.
      const hashInput = [
        messageIndex.name,
        ...sorted.map((m) => `${m.id}:${m.content}`),
      ].join("|");
      return computeSha256(hashInput);
    },

    dependencies: [],

    async execute(
      context: ProcessorExecuteContext
    ): Promise<ProcessorResult<EmbedMessagesOutput>> {
      const { thread, threadId } = context;
      const messages = thread.messages ?? [];
      const requestLog = createLogger({
        action: "pipeline.embed-messages",
        processor: "embed-messages",
        threadId,
        organizationId: thread.organizationId,
        jobId: context.context.jobId,
        messageCount: messages.length,
      });
      const ai = createAILogger(requestLog, { cost: AI_PRICING });
      let status = 200;

      if (messages.length === 0) {
        requestLog.set({
          input: { messageCount: 0 },
          outcome: { status: "completed", embeddedCount: 0, skippedCount: 0 },
        });
        requestLog.emit({ status });
        return {
          threadId,
          success: true,
          data: { embeddedCount: 0, skippedCount: 0 },
        };
      }

      let staleVectorsDeleted = false;

      try {
        requestLog.set({ input: { messageCount: messages.length } });

        const sorted = [...messages].toSorted((a, b) =>
          a.id.localeCompare(b.id)
        );

        // Prepare messages with plain text content
        const messagesToEmbed: {
          message: (typeof sorted)[0];
          plainText: string;
          index: number;
        }[] = [];

        let skippedCount = 0;

        for (let i = 0; i < sorted.length; i++) {
          const message = sorted[i];
          if (!message) continue;

          const plainText = jsonContentToPlainText(
            safeParseJSON(message.content ?? "")
          );

          if (!plainText || plainText.trim().length === 0) {
            skippedCount++;
            continue;
          }

          messagesToEmbed.push({
            message,
            plainText,
            index: i + 1,
          });
        }

        // Generate embeddings in batches
        const points: {
          vector: number[];
          text: string;
          payload: MessagePayload;
        }[] = [];

        for (
          let i = 0;
          i < messagesToEmbed.length;
          i += DEFAULT_BATCH_CONCURRENCY
        ) {
          const batch = messagesToEmbed.slice(i, i + DEFAULT_BATCH_CONCURRENCY);

          const batchResults = await Promise.all(
            batch.map(async ({ message, plainText, index }) => {
              const embedding = await generateMessageEmbedding(
                plainText,
                ai,
                requestLog
              );
              if (!embedding) return null;
              // Message ids are ULIDs and the index derives its point id from
              // them; a malformed one is skipped rather than failing the batch.
              const qdrantPointId = messageIndex.pointIdFor({
                messageId: message.id,
              });
              if (!qdrantPointId) {
                requestLog.warn("Message has an invalid ULID and was skipped", {
                  message: { id: message.id },
                  step: "convert_message_id",
                });
                return null;
              }

              return {
                text: plainText,
                vector: embedding,
                payload: {
                  messageId: message.id,
                  threadId,
                  organizationId: thread.organizationId,
                  content: plainText,
                  messageIndex: index,
                  createdAt: message.createdAt
                    ? new Date(
                        message.createdAt as unknown as string | number
                      ).getTime()
                    : Date.now(),
                },
              };
            })
          );

          for (const result of batchResults) {
            if (result) {
              points.push(result);
            } else {
              skippedCount++;
            }
          }
        }

        if (points.length > 0) {
          await messageIndex.upsertBatch(points);

          // Drop vectors for messages that no longer exist on the thread.
          await messageIndex.removeWhere({
            exclude: { messageId: points.map((p) => p.payload.messageId) },
            organizationId: thread.organizationId,
            where: { threadId },
          });
          staleVectorsDeleted = true;
        }

        requestLog.set({
          outcome: {
            status: "completed",
            embeddedCount: points.length,
            skippedCount,
            staleVectorsDeleted,
          },
        });

        return {
          threadId,
          success: true,
          data: {
            embeddedCount: points.length,
            skippedCount,
          },
        };
      } catch (error) {
        status = 500;
        requestLog.error(error instanceof Error ? error : String(error), {
          retryable: isRetryableError(error),
          step: "embed_messages",
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
      return `embed-messages:${threadId}`;
    },

    name: "embed-messages",
  };
