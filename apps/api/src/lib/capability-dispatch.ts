import {
  type Capability,
  type CapabilityEntityRef,
  invokeCapability,
} from "@connectors/framework";
import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";
import { schema } from "../live-state/schema";
import { connectorInvokeSecret, connectorRegistry } from "./connector-registry";

type ExternalEntityRow = InferLiveObject<typeof schema.externalEntity>;

/** Provider-neutral reference the connector acts on, straight from the mirror. */
export const buildEntityRef = (
  entity: ExternalEntityRow,
): CapabilityEntityRef => ({
  externalKey: entity.externalKey,
  repoFullName: entity.repoFullName,
  number: entity.number,
  url: entity.url,
});

/**
 * Resolve the enabled integration that owns a mirrored `entity` and provides
 * `capability`. Routes purely by the entity's own `provider` matched against the
 * integration `type` — no provider-name literal and no capability-level
 * selection: the target *is* the entity. Returns the integration and its
 * registry entry, or `null` when the org has no matching configured integration
 * whose connector provides the capability.
 */
export const resolveEntityCapabilityTarget = async (
  db: Pick<ServerDB<typeof schema>, "find">,
  organizationId: string,
  entity: Pick<ExternalEntityRow, "provider">,
  capability: Capability,
) => {
  const integrations = Object.values(
    await db.find(schema.integration, {
      where: { organizationId, enabled: true },
    }),
  );

  const integration = integrations.find((i) => i.type === entity.provider);
  if (!integration?.configStr) return null;

  const entry = connectorRegistry.getByType(integration.type);
  if (!entry?.manifest.capabilities.includes(capability)) return null;

  return { integration, entry };
};

/**
 * Push a thread's closed/open state onto its linked external issue, routed by
 * the mirrored issue's owning integration. Best-effort: a connector failure is
 * logged and swallowed so it never blocks the thread status change. A no-op when
 * the issue isn't mirrored, is already in the desired state, or the org has no
 * issue-tracker integration for the entity's provider.
 */
export const syncLinkedIssueState = async (
  db: Pick<ServerDB<typeof schema>, "find">,
  args: { organizationId: string; externalIssueId: string; closed: boolean },
): Promise<void> => {
  try {
    const entity = Object.values(
      await db.find(schema.externalEntity, {
        where: {
          organizationId: args.organizationId,
          externalKey: args.externalIssueId,
          type: "issue",
          deletedAt: null,
        },
      }),
    )[0];
    if (!entity) return;

    const state = args.closed ? "closed" : "open";
    // Mirror already reflects the desired state — nothing to push.
    if (entity.state === state) return;

    const target = await resolveEntityCapabilityTarget(
      db,
      args.organizationId,
      entity,
      "issue-tracker",
    );
    if (!target) return;

    await invokeCapability(
      target.entry.invokeUrl,
      {
        capability: "issue-tracker",
        method: "setState",
        config: target.integration.configStr,
        payload: { entity: buildEntityRef(entity), state },
      },
      { secret: connectorInvokeSecret },
    );
  } catch (error) {
    console.error("Failed to sync linked issue state:", error);
  }
};
