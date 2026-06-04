import {
  actionAutonomyMapSchema,
  getDefaultActionAutonomy,
} from "@workspace/schemas/signals";
import type { Migration } from "../types";

const migration: Migration = {
  name: "002_seed_autonomy_settings",
  up: async ({ db }) => {
    const orgs = await db.organization.where({}).get();
    const defaults = getDefaultActionAutonomy();

    for (const org of orgs) {
      // Preserve any unrelated keys on settings — only patch actionAutonomy.
      // Drop the legacy `signalAutonomy` key if present (pre-launch cleanup).
      const rawSettings =
        org.settings &&
        typeof org.settings === "object" &&
        !Array.isArray(org.settings)
          ? (org.settings as Record<string, unknown>)
          : {};
      const { signalAutonomy: _legacy, ...rest } = rawSettings;
      const parsedAutonomy = actionAutonomyMapSchema.safeParse(
        rest.actionAutonomy,
      );

      const next = {
        ...rest,
        actionAutonomy: {
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
