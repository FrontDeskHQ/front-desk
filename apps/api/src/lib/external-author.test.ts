import { describe, expect, it, vi } from "vitest";

import {
  ensureExternalAuthor,
  ensureWidgetAuthor,
  externalAuthorIdentityKey,
  widgetAuthorMetaId,
  UNRESOLVED_EXTERNAL_AUTHOR_NAME,
} from "./external-author";

const organizationId = "org-a";
const metaId = "slack:U123";

const mockDb = (existing: { id: string; name: string } | null) => {
  const insert = vi.fn<(row: unknown) => void>();
  const update = vi.fn<(id: string, patch: { name: string }) => void>();
  const first = vi.fn<
    () => { get: () => Promise<{ id: string; name: string } | null> }
  >(() => ({
    get: async () => existing,
  }));
  const db = {
    author: { first, insert, update },
    transaction: async (
      callback: (options: {
        trx: Parameters<typeof ensureExternalAuthor>[0];
      }) => Promise<unknown>
    ) => callback({ trx: db as Parameters<typeof ensureExternalAuthor>[0] }),
  } as unknown as Parameters<typeof ensureExternalAuthor>[0];
  return { db, first, insert, update };
};

describe(ensureExternalAuthor, () => {
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
      identityKey: externalAuthorIdentityKey(organizationId, metaId),
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

  it("rejects the reserved widget namespace", async () => {
    const { db, first, insert } = mockDb(null);

    await expect(
      ensureExternalAuthor(db, {
        metaId: widgetAuthorMetaId("customer-1"),
        name: "Ada Lovelace",
        organizationId,
      })
    ).rejects.toThrow("RESERVED_WIDGET_AUTHOR_META_ID");

    expect(first).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe(ensureWidgetAuthor, () => {
  it("stores an external subject in the namespaced meta id", async () => {
    const { db, first, insert } = mockDb(null);

    const id = await ensureWidgetAuthor(db, {
      name: "Ada Lovelace",
      organizationId,
      userId: "customer-1",
    });

    expect(first).toHaveBeenCalledWith({
      metaId: widgetAuthorMetaId("customer-1"),
      organizationId,
    });
    expect(insert).toHaveBeenCalledWith({
      id,
      identityKey: externalAuthorIdentityKey(
        organizationId,
        widgetAuthorMetaId("customer-1")
      ),
      metaId: widgetAuthorMetaId("customer-1"),
      name: "Ada Lovelace",
      organizationId,
      userId: null,
    });
  });

  it("refreshes an existing widget author's name", async () => {
    const { db, insert, update } = mockDb({
      id: "author-1",
      name: "Ada",
    });

    await expect(
      ensureWidgetAuthor(db, {
        name: "Ada Lovelace",
        organizationId,
        userId: "customer-1",
      })
    ).resolves.toBe("author-1");

    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("author-1", { name: "Ada Lovelace" });
  });

  it("leaves an unchanged widget author alone", async () => {
    const { db, insert, update } = mockDb({
      id: "author-1",
      name: "Ada Lovelace",
    });

    await ensureWidgetAuthor(db, {
      name: "Ada Lovelace",
      organizationId,
      userId: "customer-1",
    });

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not overwrite a widget author's name with an unresolved lookup", async () => {
    const { db, update } = mockDb({
      id: "author-1",
      name: "Ada Lovelace",
    });

    await ensureWidgetAuthor(db, {
      name: UNRESOLVED_EXTERNAL_AUTHOR_NAME,
      organizationId,
      userId: "customer-1",
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("re-reads the winner after a unique identity conflict", async () => {
    const insert = vi.fn<(row: unknown) => void>().mockRejectedValue({
      code: "23505",
    });
    const first = vi
      .fn<() => { get: () => Promise<{ id: string; name: string } | null> }>()
      .mockReturnValueOnce({ get: async () => null })
      .mockReturnValueOnce({
        get: async () => ({ id: "author-2", name: "Ada Lovelace" }),
      });
    const update = vi.fn<(id: string, patch: { name: string }) => void>();
    const db = {
      author: { first, insert, update },
      transaction: async (
        callback: (options: {
          trx: Parameters<typeof ensureWidgetAuthor>[0];
        }) => Promise<unknown>
      ) => callback({ trx: db as Parameters<typeof ensureWidgetAuthor>[0] }),
    } as unknown as Parameters<typeof ensureWidgetAuthor>[0];

    await expect(
      ensureWidgetAuthor(db, {
        name: "Ada Lovelace",
        organizationId,
        userId: "customer-1",
      })
    ).resolves.toBe("author-2");
    expect(first).toHaveBeenCalledTimes(2);
  });
});
