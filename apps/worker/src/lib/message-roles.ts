import z from "zod";

import type { OrderableMessage } from "./message-order";
import { newestMessage } from "./message-order";

export type MessageRole = "customer" | "agent" | "unknown";

const authorRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string().nullable(),
});

export interface ResolvedMessageAuthors {
  names: Map<string, string>;
  roles: Map<string, MessageRole>;
}

/**
 * Resolves each author's display name and role from raw author rows:
 * - customer = thread author
 * - agent = author linked to a teammate (author.userId is set)
 * - unknown = anything else
 *
 * Pure: the fetch lives on `RunState.authors()`. Rows that don't parse are
 * dropped rather than failing the run — an unrecognised author degrades to an
 * absent name and an `unknown` role, which is what the caller would infer for
 * it anyway.
 */
export const resolveAuthorsFromRows = (
  rawRows: unknown,
  threadAuthorId: string | null | undefined
): ResolvedMessageAuthors => {
  const parsedRows = z.array(z.unknown()).safeParse(rawRows);
  const rows = parsedRows.success
    ? parsedRows.data.flatMap((row) => {
        const parsedRow = authorRowSchema.safeParse(row);
        return parsedRow.success ? [parsedRow.data] : [];
      })
    : [];
  const names = new Map<string, string>();
  const roles = new Map<string, MessageRole>();

  for (const row of rows) {
    if (row.name.trim()) {
      names.set(row.id, row.name);
    }
    if (row.id === threadAuthorId) {
      roles.set(row.id, "customer");
    } else if (row.userId) {
      roles.set(row.id, "agent");
    } else {
      roles.set(row.id, "unknown");
    }
  }

  return { names, roles };
};

export const threadHasTeamReply = (
  messages: { authorId: string }[],
  roles: Map<string, MessageRole>
): boolean =>
  messages.some((message) => roles.get(message.authorId) === "agent");

/** Who spoke last, or "unknown" on an empty thread. */
export const lastMessageRole = (
  messages: (OrderableMessage & { authorId: string })[],
  roles: Map<string, MessageRole>
): MessageRole => {
  const last = newestMessage(messages);
  return last ? (roles.get(last.authorId) ?? "unknown") : "unknown";
};
