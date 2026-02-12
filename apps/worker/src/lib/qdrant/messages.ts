import { qdrantClient } from "./client";

export const MESSAGES_COLLECTION = "messages-v1";
export const MESSAGE_EMBEDDING_DIMENSIONS = 3072;

export interface MessagePayload {
  messageId: string;
  threadId: string;
  organizationId: string;
  content: string;
  messageIndex: number;
  createdAt: number;
}

export const ensureMessagesCollection = async (): Promise<boolean> => {
  try {
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (c) => c.name === MESSAGES_COLLECTION,
    );

    if (collectionExists) {
      return true;
    }

    await qdrantClient.createCollection(MESSAGES_COLLECTION, {
      vectors: {
        dense: { size: MESSAGE_EMBEDDING_DIMENSIONS, distance: "Cosine" },
      },
      sparse_vectors: {
        bm25: { modifier: "idf" },
      },
      optimizers_config: {
        indexing_threshold: 0,
      },
    });

    await qdrantClient.createPayloadIndex(MESSAGES_COLLECTION, {
      field_name: "organizationId",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(MESSAGES_COLLECTION, {
      field_name: "threadId",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(MESSAGES_COLLECTION, {
      field_name: "messageId",
      field_schema: "keyword",
    });

    console.log(`Created Qdrant collection: ${MESSAGES_COLLECTION}`);
    return true;
  } catch (error) {
    console.error("Failed to ensure messages collection:", error);
    return false;
  }
};

export const upsertMessageVectorsBatch = async (
  points: Array<{
    id: string;
    vector: {
      dense: number[];
      bm25: { text: string; model: "qdrant/bm25" };
    };
    payload: MessagePayload;
  }>,
): Promise<boolean> => {
  try {
    await qdrantClient.upsert(MESSAGES_COLLECTION, {
      wait: true,
      points: points.map((point) => ({
        id: point.id,
        vector: point.vector as unknown as Record<string, unknown>,
        payload: point.payload as unknown as Record<string, unknown>,
      })),
    });
    return true;
  } catch (error) {
    console.error("Failed to upsert message vectors batch:", error);
    return false;
  }
};

export const deleteMessageVectorsByThread = async (
  threadId: string,
): Promise<boolean> => {
  try {
    await qdrantClient.delete(MESSAGES_COLLECTION, {
      wait: true,
      filter: {
        must: [{ key: "threadId", match: { value: threadId } }],
      },
    });
    return true;
  } catch (error) {
    console.error(
      `Failed to delete message vectors for thread ${threadId}:`,
      error,
    );
    return false;
  }
};

/**
 * Deletes message vectors for a thread that are NOT in the keepMessageIds set.
 * Used after successful upsert to remove stale vectors (e.g. deleted messages).
 * Safe to call with empty keepMessageIds - deletes all vectors for the thread.
 */
export const deleteStaleMessageVectors = async (
  threadId: string,
  keepMessageIds: string[],
): Promise<boolean> => {
  try {
    const filter: {
      must: Array<
        | { key: string; match: { value: string } }
        | { key: string; match: { except: string[] } }
      >;
    } = {
      must: [{ key: "threadId", match: { value: threadId } }],
    };

    if (keepMessageIds.length > 0) {
      filter.must.push({
        key: "messageId",
        match: { except: keepMessageIds },
      });
    }

    await qdrantClient.delete(MESSAGES_COLLECTION, {
      wait: true,
      filter,
    });
    return true;
  } catch (error) {
    console.error(
      `Failed to delete stale message vectors for thread ${threadId}:`,
      error,
    );
    return false;
  }
};
