import z from "zod";

/**
 * Who wrote a message, and therefore which side of the thread it came from —
 * see "Message direction" in CONTEXT.md and ADR 0017.
 *
 * Shared because both apps need the same answer at different moments: the API
 * classifies at insert time to pick the trigger kind, the worker at read time
 * to tag the transcript handed to synthesis. Two copies would drift.
 */
export type MessageRole = "customer" | "teammate" | "unknown";

export interface ResolvedMessageAuthors {
  names: Map<string, string>;
  roles: Map<string, MessageRole>;
}

/**
 * - customer — the thread's opener, checked first so a portal customer stays
 *   the customer whatever else is true of them
 * - teammate — an author whose user belongs to the organization. Membership,
 *   not `userId`: portal customers and teammates share the `user` table, so
 *   "has a user id" only says the author authenticated.
 * - unknown — anyone we cannot place, which is every connector-relayed
 *   identity: a teammate answering in Discord and a second customer joining
 *   the thread arrive as the same row.
 */
export const resolveAuthorRole = (
  author: { id: string; isOrganizationMember: boolean; userId: string | null },
  threadAuthorId: string | null | undefined
): MessageRole => {
  if (author.id === threadAuthorId) {
    return "customer";
  }
  return author.userId && author.isOrganizationMember ? "teammate" : "unknown";
};

/**
 * Only a teammate speaks for the organization. `unknown` is inbound: silencing
 * a colleague of the customer who adds real evidence to a thread they did not
 * open is the worse of the two errors, and the invisible one.
 */
export const isOutbound = (role: MessageRole): boolean => role === "teammate";

/**
 * Resolves each author's display name and role from raw author rows.
 *
 * Pure: the fetch lives on the caller. Rows that don't parse are dropped rather
 * than failing the run — an unrecognised author degrades to an absent name and
 * an `unknown` role, which is what the caller would infer for it anyway.
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
    roles.set(row.id, resolveAuthorRole(row, threadAuthorId));
  }

  return { names, roles };
};

export const threadHasTeamReply = (
  messages: { authorId: string }[],
  roles: Map<string, MessageRole>
): boolean =>
  messages.some((message) => roles.get(message.authorId) === "teammate");

const authorRowSchema = z.object({
  id: z.string(),
  isOrganizationMember: z.boolean().default(false),
  name: z.string(),
  userId: z.string().nullable(),
});
