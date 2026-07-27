import type { InlineSuggestion } from "@workspace/schemas/signals";

import { fetchClient } from "./database/client";

/**
 * Upserts an inline suggestion by id. The read-modify-write runs server-side
 * inside a transaction (see `runUpsertInlineSuggestion`) so concurrent
 * inline-track processors writing the same thread don't clobber each other's
 * suggestions via last-writer-wins.
 */
export async function appendOrReplaceInlineSuggestion(
  threadId: string,
  organizationId: string,
  suggestion: InlineSuggestion
): Promise<void> {
  await fetchClient.mutate.thread.upsertInlineSuggestion({
    organizationId,
    suggestion,
    threadId,
  });
}
