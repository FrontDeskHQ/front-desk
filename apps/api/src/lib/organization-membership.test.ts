import { describe, expect, it, vi } from "vitest";

import { schema } from "../live-state/schema";
import { firstOrganizationAssigneeId } from "./organization-membership";

const organizationId = "org-a";

const membership = (id: string, userId: string) => ({
  enabled: true,
  id,
  organizationId,
  role: "user",
  userId,
});

const makeDb = (rows: ReturnType<typeof membership>[]) => ({
  find: vi.fn(async (_table: unknown, _opts: unknown) => {
    const byId: Record<string, unknown> = {};
    for (const row of rows) {
      byId[row.id] = row;
    }
    return byId;
  }),
});

describe("firstOrganizationAssigneeId", () => {
  it("returns the earliest enabled member by id", async () => {
    const db = makeDb([
      membership("02later", "user-later"),
      membership("01first", "user-first"),
    ]);

    await expect(
      firstOrganizationAssigneeId(db, organizationId)
    ).resolves.toBe("user-first");
    expect(db.find).toHaveBeenCalledWith(schema.organizationUser, {
      where: { enabled: true, organizationId },
    });
  });

  it("returns null when the org has no enabled members", async () => {
    const db = makeDb([]);

    await expect(
      firstOrganizationAssigneeId(db, organizationId)
    ).resolves.toBeNull();
  });
});
