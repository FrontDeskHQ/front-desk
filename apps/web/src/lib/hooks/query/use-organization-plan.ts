import { useLiveQuery } from "@live-state/sync/client";
import { useAtomValue } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

export type PlanType = "trial" | "starter" | "pro" | "beta-feedback";

/**
 * Gets the effective plan for the current organization.
 * "beta-feedback" plans are treated as "starter" (free plan) for feature checks.
 */
export const useOrganizationPlan = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const subscription = useLiveQuery(
    query.subscription.first({
      organizationId: currentOrg?.id,
    })
  );

  const rawPlan = (subscription?.plan as PlanType) ?? "trial";

  // Treat "beta-feedback" as "starter" plan for feature checks (free plan access)
  const effectivePlan: PlanType =
    rawPlan === "beta-feedback" ? "starter" : rawPlan;

  const isTrial = effectivePlan === "trial";
  const isStarter = effectivePlan === "starter";
  const isPro = effectivePlan === "pro";
  const isBetaFeedback = rawPlan === "beta-feedback";

  return {
    subscription,
    plan: effectivePlan,
    rawPlan,
    isTrial,
    isStarter,
    isPro,
    isBetaFeedback,
  };
};
