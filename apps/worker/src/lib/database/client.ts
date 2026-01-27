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

type SuggestionRow = {
  id: string;
  type: string;
  entityId: string;
  relatedEntityId: string | null;
  organizationId: string;
  resultsStr: string | null;
  metadataStr: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

interface SuggestionData {
  threadId: string;
  organizationId: string;
  similarThreads: SimilarThreadResult[];
  metadata?: Record<string, unknown>;
}

/**
 * Store or update related threads suggestions.
 * Creates one suggestion row per related thread using relatedEntityId.
 */
export const storeSuggestion = async (
  data: SuggestionData,
): Promise<boolean> => {
  const { threadId, organizationId, similarThreads, metadata } = data;

  try {
    const existingSuggestions = (await fetchClient.query.suggestion
      .where({
        type: SUGGESTION_TYPE_RELATED_THREADS,
        entityId: threadId,
        organizationId,
      })
      .get()) as SuggestionRow[];

    const existingByRelatedId = new Map<string, SuggestionRow>();
    for (const s of existingSuggestions) {
      if (s.relatedEntityId) {
        existingByRelatedId.set(s.relatedEntityId, s);
      }
    }

    const now = new Date();
    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    for (const st of similarThreads) {
      const existing = existingByRelatedId.get(st.threadId);
      const resultsStr = JSON.stringify({ score: st.score });

      if (existing) {
        await fetchClient.mutate.suggestion.update(existing.id, {
          resultsStr,
          metadataStr,
          updatedAt: now,
        });
      } else {
        await fetchClient.mutate.suggestion.insert({
          id: ulid().toLowerCase(),
          type: SUGGESTION_TYPE_RELATED_THREADS,
          entityId: threadId,
          relatedEntityId: st.threadId,
          organizationId,
          resultsStr,
          metadataStr,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return true;
  } catch (error) {
    console.error(`Failed to store suggestion for thread ${threadId}:`, error);
    return false;
  }
};
