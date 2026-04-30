import {
  getDefaultSignalAutonomy,
  signalAutonomyMapSchema,
} from "@workspace/schemas/signals";
import type { Migration } from "../types";

const migration: Migration = {
  name: "002_seed_autonomy_settings",
  up: async ({ db }) => {
    const orgs = await db.organization.where({}).get();
    const defaults = getDefaultSignalAutonomy();

    for (const org of orgs) {
      // Preserve any unrelated keys on settings — only patch signalAutonomy.
      const rawSettings =
        org.settings &&
        typeof org.settings === "object" &&
        !Array.isArray(org.settings)
          ? (org.settings as Record<string, unknown>)
          : {};
      const parsedAutonomy = signalAutonomyMapSchema.safeParse(
        rawSettings.signalAutonomy,
      );

      const next = {
        ...rawSettings,
        signalAutonomy: {
          ...defaults,
          ...(parsedAutonomy.success ? parsedAutonomy.data : {}),
        },
      };

      await db.organization.update(org.id, {
        // biome-ignore lint/suspicious/noExplicitAny: settings JSON is opaque to migrations
        settings: next as any,
      });
    }
  },
};

export default migration;
