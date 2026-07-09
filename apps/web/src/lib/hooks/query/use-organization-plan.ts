import { useLiveQuery } from "@live-state/sync/client";
import { safeParseOrgSettings } from "@workspace/schemas/organization";
import { useAtomValue } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

export type PlanType = "trial" | "starter" | "pro" | "beta-feedback";

/**
 * Gets the effective plan for the current organization.
 * "beta-feedback" plans are treated as "starter" (free plan) for feature checks.
 *
 * Plan/status are read from `organization.settings` (denormalized from the
 * owner-only `subscription` row) so every member gets correct feature gating
 * without syncing billing identifiers. Billing details (customerId, createdAt,
 * subscriptionId) live behind the owner-only `subscription.forOrg` query.
 */
export const useOrganizationPlan = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const org = useLiveQuery(
    query.organization.first({
      id: currentOrg?.id,
    })
  );

  const settings = safeParseOrgSettings(org?.settings);
  // `settings.plan` is already validated against the plan literals by the
  // schema (unknown values coerce to "trial"), so no cast/fallback is needed.
  const rawPlan: PlanType = settings.plan;
  const status = settings.subscriptionStatus;

  // Treat "beta-feedback" as "starter" plan for feature checks (free plan access)
  const effectivePlan: PlanType =
    rawPlan === "beta-feedback" ? "starter" : rawPlan;

  const isTrial = effectivePlan === "trial";
  const isStarter = effectivePlan === "starter";
  const isPro = effectivePlan === "pro";
  const isBetaFeedback = rawPlan === "beta-feedback";

  return {
    status,
    plan: effectivePlan,
    rawPlan,
    isTrial,
    isStarter,
    isPro,
    isBetaFeedback,
  };
};
