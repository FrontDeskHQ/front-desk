import type { Migration } from "../types";

/**
 * Denormalize each org's `subscription.plan` / `subscription.status` into
 * `organization.settings` so all members get correct feature gating without
 * syncing the owner-only subscription row (which carries billing identifiers).
 */
const migration: Migration = {
  name: "003_backfill_subscription_plan_to_settings",
  up: async ({ db }) => {
    const orgs = await db.organization.where({}).get();

    for (const org of orgs) {
      const subscription = (
        await db.subscription.where({ organizationId: org.id }).get()
      )[0];

      // Preserve any unrelated keys on settings — only patch plan/status.
      const rawSettings =
        org.settings &&
        typeof org.settings === "object" &&
        !Array.isArray(org.settings)
          ? (org.settings as Record<string, unknown>)
          : {};

      const next = {
        ...rawSettings,
        plan: subscription?.plan ?? "trial",
        subscriptionStatus: subscription?.status ?? null,
      };

      await db.organization.update(org.id, {
        // biome-ignore lint/suspicious/noExplicitAny: settings JSON is opaque to migrations
        settings: next as any,
      });
    }
  },
};

export default migration;
