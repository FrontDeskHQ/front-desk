import type { ServerDB } from "@live-state/sync/server";
import { schema } from "../live-state/schema";

type DigestSignalType = "digest:pending_reply" | "digest:loop_to_close";

/**
 * Deactivate active digest signals for a thread.
 * Used by message afterInsert, thread afterUpdate, and markAsAnswer hooks.
 */
export async function deactivateDigestSignals(
  db: ServerDB<typeof schema>,
  threadId: string,
  types: DigestSignalType[],
): Promise<void> {
  const now = new Date();

  for (const type of types) {
    const suggestions = Object.values(
      await db.find(schema.suggestion, {
        where: { type, entityId: threadId, active: true },
      }),
    );

    for (const suggestion of suggestions) {
      await db.update(schema.suggestion, suggestion.id, {
        active: false,
        updatedAt: now,
      });
    }
  }
}
