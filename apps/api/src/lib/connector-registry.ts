import { buildRegistry, type Capability } from "@connectors/framework";
import type { ServerDB } from "@live-state/sync/server";
import { schema } from "../live-state/schema";

/**
 * The connector registry, built once at boot from the connector manifests. The
 * core dispatches capabilities generically through this — it never references a
 * named provider.
 */
export const connectorRegistry = buildRegistry();

/**
 * Whether the org can offer `capability`, resolved from its enabled
 * integrations via the registry. Answers "can we offer this?"; a specific
 * invoked call still routes by a concrete target/integration.
 */
export async function orgHasCapability(
  db: Pick<ServerDB<typeof schema>, "find">,
  organizationId: string,
  capability: Capability,
): Promise<boolean> {
  const integrations = Object.values(
    await db.find(schema.integration, {
      where: { organizationId, enabled: true },
    }),
  );

  return connectorRegistry.hasCapability(
    integrations.map((integration) => integration.type),
    capability,
  );
}
