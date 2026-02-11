import { google } from "@ai-sdk/google";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { embed } from "ai";
import { createHash } from "node:crypto";
import {
  type MessagePayload,
  deleteMessageVectorsByThread,
  upsertMessageVectorsBatch,
} from "../../lib/qdrant/messages";
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
const computeSha256 = (data: string): string => {
  return createHash("sha256").update(data).digest("hex");
};

/**
 * Generate dense embedding vector (3072-dim) for a message
 */
const generateMessageEmbedding = async (
  text: string,
): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
      providerOptions: {
        google: {
          taskType: "RETRIEVAL_DOCUMENT",
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
    console.error("Error generating message embedding:", error);
    return null;
  }
};

/**
 * Embed-messages processor
 *
 * Embeds all messages in a thread into Qdrant for hybrid search.
 * Runs in Turn 1 (no dependencies), parallel with summarize.
 */
export const embedMessagesProcessor: ProcessorDefinition<EmbedMessagesOutput> = {
  name: "embed-messages",

  dependencies: [],

  getIdempotencyKey(threadId: string): string {
    return `embed-messages:${threadId}`;
  },

  computeHash(context: ProcessorExecuteContext): string {
    const messages = context.thread.messages ?? [];
    const sorted = [...messages].sort((a, b) => a.id.localeCompare(b.id));
    const hashInput = sorted.map((m) => `${m.id}:${m.content}`).join("|");
    return computeSha256(hashInput);
  },

  async execute(
    context: ProcessorExecuteContext,
  ): Promise<ProcessorResult<EmbedMessagesOutput>> {
    const { thread, threadId } = context;
    const messages = thread.messages ?? [];

    if (messages.length === 0) {
      return {
        threadId,
        success: true,
        data: { embeddedCount: 0, skippedCount: 0 },
      };
    }

    try {
      console.log(
        `Embedding ${messages.length} messages for thread ${threadId}`,
      );

      const sorted = [...messages].sort((a, b) => a.id.localeCompare(b.id));

      // Delete existing message vectors for this thread before re-embedding
      await deleteMessageVectorsByThread(threadId);

      // Prepare messages with plain text content
      const messagesToEmbed: Array<{
        message: (typeof sorted)[0];
        plainText: string;
        index: number;
      }> = [];

      let skippedCount = 0;

      for (let i = 0; i < sorted.length; i++) {
        const message = sorted[i];
        const plainText = jsonContentToPlainText(
          safeParseJSON(message.content),
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
      const points: Array<{
        id: string;
        vector: {
          dense: number[];
          bm25: { text: string; model: "qdrant/bm25" };
        };
        payload: MessagePayload;
      }> = [];

      for (
        let i = 0;
        i < messagesToEmbed.length;
        i += DEFAULT_BATCH_CONCURRENCY
      ) {
        const batch = messagesToEmbed.slice(i, i + DEFAULT_BATCH_CONCURRENCY);

        const batchResults = await Promise.all(
          batch.map(async ({ message, plainText, index }) => {
            const embedding = await generateMessageEmbedding(plainText);
            if (!embedding) return null;

            return {
              id: crypto.randomUUID(),
              vector: {
                dense: embedding,
                bm25: {
                  text: plainText,
                  model: "qdrant/bm25" as const,
                },
              },
              payload: {
                messageId: message.id,
                threadId,
                organizationId: thread.organizationId,
                content: plainText,
                messageIndex: index,
                createdAt: message.createdAt
                  ? new Date(message.createdAt as string | number).getTime()
                  : Date.now(),
              },
            };
          }),
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
        const stored = await upsertMessageVectorsBatch(points);

        if (!stored) {
          return {
            threadId,
            success: false,
            error: "Failed to store message vectors in Qdrant",
          };
        }
      }

      console.log(
        `Embedded ${points.length} messages for thread ${threadId} (${skippedCount} skipped)`,
      );

      return {
        threadId,
        success: true,
        data: {
          embeddedCount: points.length,
          skippedCount,
        },
      };
    } catch (error) {
      console.error(
        `Embed-messages processor failed for thread ${threadId}:`,
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
