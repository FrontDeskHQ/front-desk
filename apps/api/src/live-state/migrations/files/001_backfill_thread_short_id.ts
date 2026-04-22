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

      const unnumbered = threads.filter((t) => t.shortId == null);
      if (unnumbered.length === 0) continue;

      let n = org.shortIdCounter ?? 0;
      for (const t of unnumbered) {
        n += 1;
        await db.thread.update(t.id, { shortId: n });
      }
      await db.organization.update(org.id, { shortIdCounter: n });
    }
  },
};

export default migration;
