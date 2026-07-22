import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import type { Router } from "api/router";
import { schema } from "api/schema";

import type { Thread } from "../../types";

/**
 * Fetch client for database operations
 */
export const fetchClient = createFetchClient<Router>({
  credentials: async () => ({
    "x-discord-bot-key": process.env.DISCORD_BOT_KEY ?? "",
  }),
  schema,
  url: process.env.LIVE_STATE_API_URL ?? "http://localhost:3333/api/ls",
});

/**
 * Fetch a thread with its messages and labels
 */
export const fetchThreadWithRelations = async (
  threadId: string
): Promise<Thread | null> => {
  try {
    const threads = await fetchClient.query.thread.byIds({ ids: [threadId] });

    const thread = threads[0];
    return (thread as Thread) ?? null;
  } catch (error) {
    console.error(`Failed to fetch thread ${threadId}:`, error);
    return null;
  }
};

/**
 * A mirrored pull request as returned by the API's `prByUrl` query — the
 * depth-verification payload for synthesis' `read_pr` tool (FRO-204).
 */
export type MirroredPr = NonNullable<
  Awaited<ReturnType<typeof fetchClient.query.externalEntity.prByUrl>>
>;

/**
 * Fetch a single mirrored pull request by its canonical URL, scoped to the org.
 * Returns null when the PR was never mirrored (or has been soft-deleted).
 */
export const fetchMirroredPrByUrl = async (
  organizationId: string,
  url: string
): Promise<MirroredPr | null> => {
  try {
    return await fetchClient.query.externalEntity.prByUrl({
      organizationId,
      url,
    });
  } catch (error) {
    console.error(`Failed to fetch mirrored PR ${url}:`, error);
    return null;
  }
};

/**
 * Fetch multiple threads with their messages and labels
 */
export const fetchThreadsWithRelations = async (
  threadIds: string[]
): Promise<Map<string, Thread>> => {
  const threads = new Map<string, Thread>();

  if (threadIds.length === 0) {
    return threads;
  }

  try {
    const results = await fetchClient.query.thread.byIds({ ids: threadIds });

    for (const thread of results) {
      threads.set(thread.id, thread as Thread);
    }
  } catch (error) {
    console.error(`Failed to fetch threads:`, error);
  }

  return threads;
};
