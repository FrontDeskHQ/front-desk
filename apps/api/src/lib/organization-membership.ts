import type { ServerDB } from "@live-state/sync/server";

import { schema } from "../live-state/schema";

type MembershipDb = Pick<ServerDB<typeof schema>, "find">;

/**
 * Which of `userIds` belong to the organization.
 *
 * Membership — not `author.userId` — is what makes someone one of ours.
 * Historical customer authors may still reference the shared `user` table, so
 * "has a user id" is not proof of organization membership. See ADR 0017.
 */
export const organizationMemberUserIds = async (
  db: MembershipDb,
  organizationId: string,
  userIds: readonly (string | null | undefined)[]
): Promise<Set<string>> => {
  const candidates = [...new Set(userIds.filter((id): id is string => !!id))];
  if (candidates.length === 0) {
    return new Set();
  }

  const memberships = Object.values(
    await db.find(schema.organizationUser, {
      where: { organizationId, userId: { $in: candidates } },
    })
  );

  return new Set(memberships.map((membership) => membership.userId));
};

export const isOrganizationMember = async (
  db: MembershipDb,
  organizationId: string,
  userId: string | null | undefined
): Promise<boolean> =>
  (await organizationMemberUserIds(db, organizationId, [userId])).size > 0;

/**
 * Temporary default assignee until FRO-215 (assignment routing) lands.
 *
 * Picks the earliest enabled membership in the org (`organizationUser.id` is a
 * ULID, so lexicographic order is insertion order). The org creator is
 * typically that row. Returns null when the org has no enabled members.
 */
export const firstOrganizationAssigneeId = async (
  db: MembershipDb,
  organizationId: string
): Promise<string | null> => {
  const memberships = Object.values(
    await db.find(schema.organizationUser, {
      where: { enabled: true, organizationId },
    })
  );

  const first = memberships.toSorted((a, b) => a.id.localeCompare(b.id))[0];
  return first?.userId ?? null;
};
