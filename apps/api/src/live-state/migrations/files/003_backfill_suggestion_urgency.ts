import type { Migration } from "../types";

const migration: Migration = {
  name: "003_backfill_suggestion_urgency",
  up: async ({ db }) => {
    const rows = await db.suggestion.where({}).get();

    for (const row of rows) {
      if (row.urgencyScore == null) {
        await db.suggestion.update(row.id, { urgencyScore: 0 });
      }
    }
  },
};

export default migration;
