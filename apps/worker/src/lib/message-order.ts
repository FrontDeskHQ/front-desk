/**
 * The one definition of "which message came last".
 *
 * Order by `createdAt` with `id` as a stable tie-breaker. Sorting by `id` alone
 * is wrong for Slack/Discord backfills, where ids are ULIDs assigned at insert
 * time but `createdAt` reflects the original external timestamp — a backfilled
 * conversation would come out newest-first.
 *
 * Shared rather than reimplemented per call site: the synthesis context and the
 * reply [action gate](../pipeline/core/action-gates.ts) both decide things from
 * message order, and an ordering fix that reached only one of them would let
 * them disagree about what the customer last said.
 */

const sentAt = (createdAt: unknown): number => {
  const time = new Date(createdAt as string | number | Date).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export interface OrderableMessage {
  createdAt: unknown;
  id: string;
}

export const sortMessagesByTime = <T extends OrderableMessage>(
  messages: readonly T[] | null | undefined
): T[] =>
  [...(messages ?? [])].toSorted((a, b) => {
    const delta = sentAt(a.createdAt) - sentAt(b.createdAt);
    return delta === 0 ? a.id.localeCompare(b.id) : delta;
  });

/** The newest message, or undefined on an empty thread. */
export const newestMessage = <T extends OrderableMessage>(
  messages: readonly T[] | null | undefined
): T | undefined => sortMessagesByTime(messages).at(-1);
