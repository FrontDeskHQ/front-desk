import type { ServerDB } from "@live-state/sync/server";

import type { schema } from "../live-state/schema";

type MessageSequenceDB = Pick<ServerDB<typeof schema>, "thread">;

/**
 * Lock a thread row for the duration of the surrounding transaction.
 *
 * live-state exposes row updates but not a direct `FOR UPDATE` primitive. A
 * no-op update of the immutable `createdAt` column still takes the database
 * row lock, and the lock is held until the caller's transaction commits.
 */
export const lockThread = async (db: MessageSequenceDB, threadId: string) => {
  const current = await db.thread.one(threadId).get();
  if (!current) {
    throw new Error("THREAD_NOT_FOUND");
  }

  await db.thread.update(threadId, { createdAt: current.createdAt });

  const locked = await db.thread.one(threadId).get();
  if (!locked) {
    throw new Error("THREAD_NOT_FOUND");
  }

  return locked;
};

/**
 * Allocate the next server-owned insertion cursor for a thread.
 *
 * Every message insertion path calls this inside the same transaction as its
 * message insert. The per-thread row lock therefore serializes writers across
 * API processes and keeps allocation order aligned with commit order.
 */
export const nextMessageInsertionSequence = async (
  db: MessageSequenceDB,
  threadId: string,
  lockedThread?: Awaited<ReturnType<typeof lockThread>>
): Promise<number> => {
  const thread = lockedThread ?? (await lockThread(db, threadId));
  const sequence = (thread.messageSequence ?? 0) + 1;
  await db.thread.update(threadId, { messageSequence: sequence });
  return sequence;
};
