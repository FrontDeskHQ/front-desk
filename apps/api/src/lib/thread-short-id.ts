import type { ServerDB } from "@live-state/sync/server";
import type { schema } from "../live-state/schema";

type DB = ServerDB<typeof schema>;

/**
 * Returns the next per-organization thread shortId by reading the current
 * counter, incrementing it, and writing the new value back.
 *
 * NOT atomic: the read/compute/write happens through live-state's ServerDB
 * without row-level locking, so two concurrent callers for the same org can
 * observe the same counter and produce duplicate shortIds. Callers should
 * invoke this inside a transaction that also performs the thread insert so
 * a rolled-back insert doesn't burn a number, but the transaction alone
 * does not prevent cross-transaction collisions.
 */
export async function nextThreadShortId(
  db: DB,
  organizationId: string,
): Promise<number> {
  const org = await db.organization.one(organizationId).get();
  if (!org) {
    throw new Error(
      `nextThreadShortId: organization ${organizationId} not found`,
    );
  }
  const next = (org.shortIdCounter ?? 0) + 1;
  await db.organization.update(organizationId, { shortIdCounter: next });
  return next;
}
