import { describe, expect, it, vi } from "vitest";

import {
  ensureExternalAuthor,
  UNRESOLVED_EXTERNAL_AUTHOR_NAME,
} from "./external-author";

const organizationId = "org-a";
const metaId = "slack:U123";

const mockDb = (existing: { id: string; name: string } | null) => {
  const insert = vi.fn();
  const update = vi.fn();
  const first = vi.fn(() => ({
    get: async () => existing,
  }));
  const db = {
    author: { first, insert, update },
  } as unknown as Parameters<typeof ensureExternalAuthor>[0];
  return { db, first, insert, update };
};

describe("ensureExternalAuthor", () => {
  it("creates an author when none exists for the metaId", async () => {
    const { db, insert, update } = mockDb(null);

    const id = await ensureExternalAuthor(db, {
      metaId,
      name: "Ada Lovelace",
      organizationId,
    });

    expect(id).toMatch(/^[0-9a-z]{26}$/);
    expect(insert).toHaveBeenCalledWith({
      id,
      metaId,
      name: "Ada Lovelace",
      organizationId,
      userId: null,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes the stored name when the provider sent a new one", async () => {
    const { db, insert, update } = mockDb({
      id: "author-1",
      name: "Ada",
    });

    await expect(
      ensureExternalAuthor(db, {
        metaId,
        name: "Ada Lovelace",
        organizationId,
      })
    ).resolves.toBe("author-1");

    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("author-1", { name: "Ada Lovelace" });
  });

  it("leaves the row alone when the name is unchanged", async () => {
    const { db, insert, update } = mockDb({
      id: "author-1",
      name: "Ada Lovelace",
    });

    await ensureExternalAuthor(db, {
      metaId,
      name: "Ada Lovelace",
      organizationId,
    });

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not overwrite a resolved name with an unresolved lookup", async () => {
    const { db, update } = mockDb({
      id: "author-1",
      name: "Ada Lovelace",
    });

    await ensureExternalAuthor(db, {
      metaId,
      name: UNRESOLVED_EXTERNAL_AUTHOR_NAME,
      organizationId,
    });

    expect(update).not.toHaveBeenCalled();
  });
});
