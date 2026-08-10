import type { OrganizationSettings } from "@workspace/schemas/organization";

import type { Migration } from "../types";

/**
 * Drops the `close` key that `002_seed_autonomy_settings` wrote into every
 * org's `actionAutonomy`. ADR 0014 deleted the action kind, and
 * `actionAutonomyMapSchema` keys on the enum — so a leftover `close` fails the
 * whole map with `invalid_key`, and `safeParseOrgSettings` swallows that and
 * returns `{}`. The visible symptom would be every org silently reverting to
 * default autonomy for *every* kind, not just the one that went away.
 *
 * Deliberately not a compat shim: nothing reads `close`, and this removes the
 * key rather than translating it. There are no customers yet, so no attempt is
 * made to carry a deliberate `close: "off"` over to `set_status` — a fresh
 * default is the honest outcome.
 */
const migration: Migration = {
  name: "004_drop_close_autonomy",
  up: async ({ db }) => {
    const orgs = await db.organization.where({}).get();

    for (const org of orgs) {
      const rawSettings =
        org.settings &&
        typeof org.settings === "object" &&
        !Array.isArray(org.settings)
          ? (org.settings as Record<string, unknown>)
          : {};

      const autonomy = rawSettings.actionAutonomy;
      if (!autonomy || typeof autonomy !== "object" || Array.isArray(autonomy)) {
        continue;
      }

      const { close: _dropped, ...remaining } = autonomy as Record<
        string,
        unknown
      >;
      if (!("close" in autonomy)) {
        continue;
      }

      await db.organization.update(org.id, {
        settings: {
          ...rawSettings,
          actionAutonomy: remaining,
        } as OrganizationSettings,
      });
    }
  },
};

export default migration;
