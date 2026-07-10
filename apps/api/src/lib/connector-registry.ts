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
 * Shared internal secret the core sends when invoking a connector capability,
 * so the connector can authenticate the caller. Reuses the existing core↔
 * connector bot key (`DISCORD_BOT_KEY`) — same trust boundary.
 */
export const connectorInvokeSecret = process.env.DISCORD_BOT_KEY ?? null;

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
