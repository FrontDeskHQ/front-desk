import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import type { Router } from "api/router";
import { schema } from "api/schema";
import { ulid } from "ulid";
import type { Thread } from "../../types";
import type { SimilarThreadResult } from "../qdrant/threads";

const SUGGESTION_TYPE_RELATED_THREADS = "related_threads";

/**
 * Fetch client for database operations
 */
export const fetchClient = createFetchClient<Router>({
  url: process.env.LIVE_STATE_API_URL ?? "http://localhost:3333/api/ls",
  schema,
  credentials: async () => ({
    "x-discord-bot-key": process.env.DISCORD_BOT_KEY ?? "",
  }),
});

/**
 * Fetch a thread with its messages and labels
 */
export const fetchThreadWithRelations = async (
  threadId: string,
): Promise<Thread | null> => {
  try {
    const threads = await fetchClient.query.thread
      .where({ id: threadId })
      .include({
        messages: true,
        labels: {
          label: true,
        },
      })
      .get();

    const thread = threads[0];
    return (thread as Thread) ?? null;
  } catch (error) {
    console.error(`Failed to fetch thread ${threadId}:`, error);
    return null;
  }
};

/**
 * Fetch multiple threads with their messages and labels
 */
export const fetchThreadsWithRelations = async (
  threadIds: string[],
): Promise<Map<string, Thread>> => {
  const threads = new Map<string, Thread>();

  if (threadIds.length === 0) {
    return threads;
  }

  try {
    const results = await fetchClient.query.thread
      .where({
        id: { $in: threadIds },
      })
      .include({
        messages: true,
        labels: {
          label: true,
        },
      })
      .get();

    for (const thread of results) {
      threads.set(thread.id, thread as Thread);
    }
  } catch (error) {
    console.error(`Failed to fetch threads:`, error);
  }

  return threads;
};

interface SuggestionData {
  threadId: string;
  organizationId: string;
  similarThreads: SimilarThreadResult[];
  metadata?: Record<string, unknown>;
}

/**
 * Store or update a related threads suggestion
 */
export const storeSuggestion = async (
  data: SuggestionData,
): Promise<boolean> => {
  const { threadId, organizationId, similarThreads, metadata } = data;

  try {
    // Check if suggestion already exists
    const existingSuggestion = await fetchClient.query.suggestion
      .first({
        type: SUGGESTION_TYPE_RELATED_THREADS,
        entityId: threadId,
        organizationId,
      })
      .get();

    const now = new Date();

    // Format similar threads for storage (just threadId and score)
    const resultsStr = JSON.stringify(
      similarThreads.map((st) => ({
        threadId: st.threadId,
        score: st.score,
      })),
    );

    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    if (existingSuggestion) {
      // Update existing suggestion
      await fetchClient.mutate.suggestion.update(existingSuggestion.id, {
        resultsStr,
        metadataStr,
        updatedAt: now,
      });
    } else {
      // Insert new suggestion
      await fetchClient.mutate.suggestion.insert({
        id: ulid().toLowerCase(),
        type: SUGGESTION_TYPE_RELATED_THREADS,
        entityId: threadId,
        organizationId,
        resultsStr,
        metadataStr,
        createdAt: now,
        updatedAt: now,
      });
    }

    return true;
  } catch (error) {
    console.error(`Failed to store suggestion for thread ${threadId}:`, error);
    return false;
  }
};
