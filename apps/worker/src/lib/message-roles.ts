import { fetchClient } from "./database/client";

export type MessageRole = "customer" | "agent" | "unknown";

export interface ResolvedMessageAuthors {
  names: Map<string, string>;
  roles: Map<string, MessageRole>;
}

/**
 * Resolves author names and message roles in one lookup so synthesis can use
 * the customer's display name without adding a second author query.
 */
export const resolveMessageAuthors = async (
  authorIds: string[],
  threadAuthorId: string | null | undefined
): Promise<ResolvedMessageAuthors> => {
  const unique = [...new Set(authorIds.filter(Boolean))];
  const rows = (await fetchClient.query.author.byIds({
    ids: unique,
  })) as { id: string; name: string; userId: string | null }[];
  const names = new Map<string, string>();
  const roles = new Map<string, MessageRole>();

  for (const row of rows) {
    if (!row) {
      continue;
    }
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

/**
 * Resolves each message author's role:
 * - customer = thread author
 * - agent = author linked to a teammate (author.userId is set)
 * - unknown = anything else
 */
export const resolveMessageRoles = async (
  authorIds: string[],
  threadAuthorId: string | null | undefined
): Promise<Map<string, MessageRole>> => {
  const { roles } = await resolveMessageAuthors(authorIds, threadAuthorId);
  return roles;
};

export const threadHasTeamReply = (
  messages: { authorId: string }[],
  roles: Map<string, MessageRole>
): boolean =>
  messages.some((message) => roles.get(message.authorId) === "agent");
