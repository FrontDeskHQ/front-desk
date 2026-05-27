import type { InlineSuggestion } from "@workspace/schemas/signals";
import { fetchClient } from "./database/client";

export async function appendOrReplaceInlineSuggestion(
  threadId: string,
  suggestion: InlineSuggestion,
): Promise<void> {
  const rows = (await fetchClient.query.thread
    .where({ id: threadId })
    .get()) as Array<{ inlineSuggestions: InlineSuggestion[] | null }>;
  const current = rows[0]?.inlineSuggestions ?? [];
  const idx = current.findIndex((s) => s.id === suggestion.id);
  const next =
    idx >= 0
      ? current.map((s, i) => (i === idx ? suggestion : s))
      : [...current, suggestion];
  await fetchClient.mutate.thread.update(threadId, {
    inlineSuggestions: next,
  });
}
