import "../src/env";

import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { generateEmbedding } from "../src/lib/ai/embeddings";
import {
  isTypesenseAvailable,
  upsertDocument,
} from "../src/lib/search/typesense";
import { storage } from "../src/live-state/storage";

const BATCH_SIZE = 100;

type MessageRow = {
  id: string;
  content: string;
  organizationId: string;
  threadId: string;
};

const backfillMessages = async () => {
  if (!isTypesenseAvailable()) {
    console.error(
      "Typesense client is not configured. Please set TYPESENSE_API_KEY environment variable."
    );
    process.exit(1);
  }

  console.log("Starting Typesense backfill for messages...\n");

  const db = storage.internalDB;

  try {
    // Fetch all messages from the database with their thread organizationId and threadId
    console.log("Fetching messages from database...");
    const allMessages = (await db
      .selectFrom("message")
      .innerJoin("thread", "thread.id", "message.threadId")
      .select([
        "message.id",
        "message.content",
        "message.threadId",
        "thread.organizationId",
      ])
      .execute()) as MessageRow[];

    console.log(`Found ${allMessages.length} messages to index.\n`);

    if (allMessages.length === 0) {
      console.log("No messages to backfill.");
      return;
    }

    // Group messages by thread to calculate message indices
    const messagesByThread = new Map<string, MessageRow[]>();
    for (const message of allMessages) {
      const threadMessages = messagesByThread.get(message.threadId) ?? [];
      threadMessages.push(message);
      messagesByThread.set(message.threadId, threadMessages);
    }

    // Sort messages within each thread by ID (ULID-based chronological order)
    for (const messages of messagesByThread.values()) {
      messages.sort((a, b) => a.id.localeCompare(b.id));
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Process messages in batches
    for (let i = 0; i < allMessages.length; i += BATCH_SIZE) {
      const batch = allMessages.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allMessages.length / BATCH_SIZE);

      console.log(
        `Processing batch ${batchNumber}/${totalBatches} (messages ${
          i + 1
        }-${Math.min(i + BATCH_SIZE, allMessages.length)})...`
      );

      // Process each message in the batch
      for (const message of batch) {
        try {
          // Check if organizationId exists
          if (!message.organizationId) {
            console.warn(
              `  ⚠️  Message ${message.id}: Thread has no organizationId, skipping...`
            );
            skippedCount++;
            continue;
          }

          // Convert content to plain text
          const plainTextContent = jsonContentToPlainText(
            safeParseJSON(message.content)
          );

          // Calculate message index within thread
          const threadMessages = messagesByThread.get(message.threadId) ?? [];
          const messageIndex =
            threadMessages.findIndex((msg) => msg.id === message.id) + 1;

          // Generate embedding for the message content
          const embedding = await generateEmbedding(plainTextContent);

          // Prepare Typesense document
          const typesenseDocument: {
            id: string;
            content: string;
            organizationId: string;
            threadId: string;
            messageIndex: number;
            embedding?: number[];
          } = {
            id: message.id,
            content: plainTextContent,
            organizationId: message.organizationId,
            threadId: message.threadId,
            messageIndex: messageIndex,
          };

          // Add embedding if generation was successful
          if (embedding) {
            typesenseDocument.embedding = embedding;
          }

          // Index the message in Typesense
          const upserted = await upsertDocument(
            "messages",
            typesenseDocument
          );

          if (!upserted) {
            throw new Error("Typesense upsert failed");
          }

          successCount++;
        } catch (error) {
          errorCount++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `  ❌ Error indexing message ${message.id}: ${errorMessage}`
          );
        }
      }

      // Show progress
      const processed = Math.min(i + BATCH_SIZE, allMessages.length);
      const progress = ((processed / allMessages.length) * 100).toFixed(1);
      console.log(
        `  Progress: ${processed}/${allMessages.length} (${progress}%) - Success: ${successCount}, Errors: ${errorCount}, Skipped: ${skippedCount}\n`
      );
    }

    // Final summary
    console.log("\n" + "=".repeat(50));
    console.log("Backfill completed!");
    console.log("=".repeat(50));
    console.log(`Total messages: ${allMessages.length}`);
    console.log(`Successfully indexed: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log("=".repeat(50));
  } catch (error) {
    console.error("Fatal error during backfill:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await storage.internalDB.destroy();
    process.exit(0);
  }
};

// Run the backfill
backfillMessages().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
