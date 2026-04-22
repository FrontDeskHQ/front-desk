import type { ServerDB } from "@live-state/sync/server";
import type { schema } from "../live-state/schema";

type DB = ServerDB<typeof schema>;

/**
 * Atomically reserve the next per-organization thread shortId.
 * Must be called inside a transaction that also performs the thread insert,
 * so a rolled-back insert doesn't burn a number.
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
