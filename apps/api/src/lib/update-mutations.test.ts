import { describe, expect, it, vi } from "vitest";

import { schema } from "../live-state/schema";
import { runMarkReplicated } from "./update-mutations";

describe("mark replicated mutation", () => {
  it("uses the storage methods when the collection is named update", async () => {
    const existingUpdate = {
      createdAt: new Date("2026-08-11T12:00:00.000Z"),
      id: "update-1",
      metadataStr: "{}",
      replicatedStr: JSON.stringify({}),
      threadId: "thread-1",
      type: "status_changed",
      userId: null,
    };
    const findOne = vi.fn(async () => existingUpdate);
    const update = vi.fn(async () => existingUpdate);
    const db = { findOne, update } as unknown as Parameters<
      typeof runMarkReplicated
    >[0];
    const replicatedStr = JSON.stringify({ discord: "message-1" });

    await expect(
      runMarkReplicated(db, {
        replicatedStr,
        updateId: existingUpdate.id,
      })
    ).resolves.toMatchObject({
      id: existingUpdate.id,
      replicatedStr,
    });

    expect(findOne).toHaveBeenCalledWith(schema.update, existingUpdate.id);
    expect(update).toHaveBeenCalledWith(schema.update, existingUpdate.id, {
      replicatedStr,
    });
  });
});
