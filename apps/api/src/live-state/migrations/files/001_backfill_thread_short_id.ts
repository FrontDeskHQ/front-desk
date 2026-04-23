import type { Migration } from "../types";

const migration: Migration = {
  name: "001_backfill_thread_short_id",
  up: async ({ db }) => {
    const orgs = await db.organization.where({}).get();

    for (const org of orgs) {
      const threads = await db.thread
        .where({ organizationId: org.id })
        .orderBy("createdAt", "asc")
        .get();

      // Seed from the max of counter and any existing shortIds so we never
      // reassign a value that collides with a thread already numbered by
      // nextThreadShortId (e.g. from an earlier partial run).
      const maxExisting = threads.reduce(
        (acc, t) => (t.shortId != null && t.shortId > acc ? t.shortId : acc),
        0,
      );
      let n = Math.max(org.shortIdCounter ?? 0, maxExisting);

      const unnumbered = threads.filter((t) => t.shortId == null);
      for (const t of unnumbered) {
        n += 1;
        await db.thread.update(t.id, { shortId: n });
      }

      if (n !== (org.shortIdCounter ?? 0)) {
        await db.organization.update(org.id, { shortIdCounter: n });
      }
    }
  },
};

export default migration;
