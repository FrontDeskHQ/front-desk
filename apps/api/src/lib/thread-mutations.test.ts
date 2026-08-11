import { describe, expect, it, vi } from "vitest";

import { runMarkDuplicate } from "./thread-mutations";

const organizationId = "org-a";

describe("runMarkDuplicate", () => {
  it("rejects a deleted target thread", async () => {
    const source = {
      deletedAt: null,
      id: "source-thread",
      organizationId,
      status: 0,
    };
    const deletedTarget = {
      deletedAt: new Date("2026-08-11T12:00:00.000Z"),
      id: "deleted-target",
      name: "Deleted target",
      organizationId,
    };
    const first = vi.fn(
      (where: { deletedAt?: Date | null; id: string }) => ({
        get: async () =>
          where.id === source.id
            ? source
            : where.deletedAt === null
              ? null
              : deletedTarget,
      })
    );
    const update = vi.fn();
    const db = {
      insert: vi.fn(),
      thread: { first, update },
    } as unknown as Parameters<typeof runMarkDuplicate>[0];

    await expect(
      runMarkDuplicate(
        db,
        {
          duplicateOfThreadId: deletedTarget.id,
          organizationId,
          threadId: source.id,
        },
        { userId: null, userName: null }
      )
    ).rejects.toThrow("TARGET_THREAD_NOT_FOUND");

    expect(update).not.toHaveBeenCalled();
  });
});
