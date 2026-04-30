import { safeParseOrgSettings } from "@workspace/schemas/organization";
import { getDefaultSignalAutonomy } from "@workspace/schemas/signals";
import type { Migration } from "../types";

const migration: Migration = {
  name: "002_seed_autonomy_settings",
  up: async ({ db }) => {
    const orgs = await db.organization.where({}).get();
    const defaults = getDefaultSignalAutonomy();

    for (const org of orgs) {
      const current = safeParseOrgSettings(org.settings);
      const merged = {
        ...current,
        signalAutonomy: {
          ...defaults,
          ...(current.signalAutonomy ?? {}),
        },
      };

      await db.organization.update(org.id, { settings: merged });
    }
  },
};

export default migration;
