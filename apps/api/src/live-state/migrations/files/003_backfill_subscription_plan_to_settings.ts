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
      // Order deterministically so a (rare) multi-row org mirrors its most
      // recent billing state rather than an arbitrary row.
      const subscription = (
        await db.subscription
          .where({ organizationId: org.id })
          .orderBy("updatedAt", "desc")
          .get()
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
