import type { ServerDB } from "@live-state/sync/server";

import { schema } from "../live-state/schema";

type MembershipDb = Pick<ServerDB<typeof schema>, "find">;

/**
 * Which of `userIds` belong to the organization.
 *
 * Membership — not `author.userId` — is what makes someone one of ours. Portal
 * customers authenticate through a separate Better-Auth instance backed by the
 * same `user` table, so "has a user id" is true of the customer too. See
 * ADR 0017.
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
