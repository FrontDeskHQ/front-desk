import { useLiveQuery } from "@live-state/sync/client";
import { useAtomValue } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { useOrganizationPlan } from "~/lib/hooks/query/use-organization-plan";
import { query } from "~/lib/live-state";

export const MAX_STARTER_INTEGRATIONS = 2;

/**
 * Hook to check plan limits for various features.
 * @param integrationType - Optional integration type to check if it's already enabled (excludes it from limit check)
 * @returns Object with limit information grouped by feature
 */
export const usePlanLimits = (integrationType?: string) => {
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const { plan } = useOrganizationPlan();

  const integrations = useLiveQuery(
    query.integration.where({
      organizationId: activeOrg?.id,
    })
  );

  const enabledIntegrations = integrations?.filter((i) => i.enabled) ?? [];
  const enabledIntegrationsCount = enabledIntegrations.length;

  const isOnLimitedPlan = plan === "starter";

  const isCurrentIntegrationEnabled = integrationType
    ? enabledIntegrations.some((i) => i.type === integrationType)
    : false;

  const hasReachedLimit =
    isOnLimitedPlan &&
    enabledIntegrationsCount >= MAX_STARTER_INTEGRATIONS &&
    !isCurrentIntegrationEnabled;

  return {
    integrations: {
      enabledCount: enabledIntegrationsCount,
      max: MAX_STARTER_INTEGRATIONS,
      hasReachedLimit,
      isOnLimitedPlan,
    },
  };
};
