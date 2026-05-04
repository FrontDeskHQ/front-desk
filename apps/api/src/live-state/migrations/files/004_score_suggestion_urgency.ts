import {
  computeUrgency,
  signalTypeFromStored,
} from "@workspace/schemas/signals";
import type { Migration } from "../types";

const migration: Migration = {
  name: "004_score_suggestion_urgency",
  up: async ({ db }) => {
    const rows = await db.suggestion.where({}).get();
    const now = Date.now();

    for (const row of rows) {
      const normalized = signalTypeFromStored(row.type);
      if (!normalized) continue;

      const ageHours = row.createdAt
        ? Math.max(
            0,
            (now - new Date(row.createdAt).getTime()) / (1000 * 60 * 60),
          )
        : 0;
      const urgencyScore = computeUrgency({
        signalType: normalized,
        ageHours,
      });

      if (row.urgencyScore !== urgencyScore) {
        await db.suggestion.update(row.id, { urgencyScore });
      }
    }
  },
};

export default migration;
