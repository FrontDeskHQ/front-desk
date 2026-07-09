import { fetchClient } from "./database/client";

export type MessageRole = "customer" | "agent" | "unknown";

/**
 * Resolves each message author's role:
 * - customer = thread author
 * - agent = author linked to a teammate (author.userId is set)
 * - unknown = anything else
 */
export const resolveMessageRoles = async (
  authorIds: string[],
  threadAuthorId: string | null | undefined,
): Promise<Map<string, MessageRole>> => {
  const unique = [...new Set(authorIds.filter(Boolean))];
  const rows = (await fetchClient.query.author.byIds({
    ids: unique,
  })) as Array<{ id: string; userId: string | null }>;
  const map = new Map<string, MessageRole>();
  for (const row of rows) {
    if (!row) continue;
    if (row.id === threadAuthorId) map.set(row.id, "customer");
    else if (row.userId) map.set(row.id, "agent");
    else map.set(row.id, "unknown");
  }
  return map;
};

export const threadHasTeamReply = (
  messages: Array<{ authorId: string }>,
  roles: Map<string, MessageRole>,
): boolean =>
  messages.some((message) => roles.get(message.authorId) === "agent");
