import { typesHaveCapability } from "@connectors/framework";
import type { Capability } from "@connectors/framework";
import { useLiveQuery } from "@live-state/sync/client";
import { useAtomValue } from "jotai/react";

import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

/**
 * The `type`s of the active org's enabled integrations. Provider-agnostic:
 * consumers pair this with the connector manifests to reason about capabilities
 * rather than checking for a named provider.
 */
export function useEnabledIntegrationTypes(): string[] {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const integrations = useLiveQuery(
    query.integration.where({
      enabled: true,
      organizationId: currentOrg?.id,
    })
  );
  return (integrations ?? []).map((integration) => integration.type);
}

/**
 * Whether the active org can offer `capability`, resolved from its enabled
 * integrations via the connector manifests. Client mirror of the API's
 * `orgHasCapability` — answers "can we show this affordance?"; a specific
 * invoked call still routes by a concrete target. Replaces `type:"github"`
 * gating in the UI.
 */
export function useOrgCapability(capability: Capability): boolean {
  return typesHaveCapability(useEnabledIntegrationTypes(), capability);
}
