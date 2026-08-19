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

/**
 * The values of `message.origin` that mean *FrontDesk composed this message*:
 *
 * - `agent_read` — a [thread read](../../../CONTEXT.md#thread-read) reply a
 *   human accepted. Sent as the accepting human.
 * - `agent_auto` — a reply the Agent sent autonomously. Sent as the thread's
 *   assignee (ADR 0017); no human saw it first.
 *
 * The two are separate because a human's accept and the Agent acting alone
 * read differently to whoever comes along next, even though neither supersedes
 * the read it came from.
 *
 * A *subset* of the column, not its full range: connector ingest writes the
 * provider name there (`"discord"`, …) and a message typed in the app or
 * posted from the portal writes nothing. So the column stays a free string —
 * parse against this to ask "did we send it?", never to validate the field.
 */
export const messageOriginSchema = z.enum(["agent_read", "agent_auto"]);
export type MessageOrigin = z.infer<typeof messageOriginSchema>;

/**
 * Whether FrontDesk itself composed and sent this message. A FrontDesk-
 * originated message never enqueues a `supersede` trigger: the read that
 * produced it already accounts for it, and clearing that read would delete the
 * sibling actions a human still has to approve (ADR 0017, amended).
 */
export const isFrontDeskOriginated = (
  origin: string | null | undefined
): boolean => messageOriginSchema.safeParse(origin).success;

/**
 * `message.origin` as a *caller* may set it: a free string (connector ingest
 * writes the provider name) with the FrontDesk-composed values fenced off.
 * Those tell the insert hook "we sent this", which skips the trigger, so a
 * caller that could set them could silence the Agent on an ordinary message.
 * Only `reply.ts` stamps them, and it inserts directly rather than through a
 * public mutation.
 *
 * Shared by every public write path that accepts an origin — one guard, so a
 * new path cannot quietly reopen the hole.
 */
export const callerOriginSchema = z
  .string()
  .nullable()
  .optional()
  .refine((origin) => !isFrontDeskOriginated(origin), {
    message: "ORIGIN_RESERVED",
  });

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
 * Direction is membership, and only membership (ADR 0017) — deliberately not
 * derived from `MessageRole`, which resolves the opener to `customer` before it
 * looks at membership. A teammate who opened the thread is still speaking for
 * the organization, and their reply must not trigger a run.
 *
 * An author with no membership is inbound, including `unknown`: silencing a
 * colleague of the customer who adds real evidence to a thread they did not
 * open is the worse of the two errors, and the invisible one.
 */
export const isOutbound = (author: {
  isOrganizationMember: boolean;
}): boolean => author.isOrganizationMember;

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
