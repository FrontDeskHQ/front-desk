import {
  invokeCapability,
  RemoteInvokeError,
  RemoteInvokeTimeoutError,
} from "@connectors/framework";
import type {
  Capability,
  CapabilityEntityRef,
  InvokeEnvelope,
} from "@connectors/framework";
import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";

import { schema } from "../live-state/schema";
import { connectorInvokeSecret, connectorRegistry } from "./connector-registry";
import { errors, isPublicError } from "./errors";

type ExternalEntityRow = InferLiveObject<typeof schema.externalEntity>;

/** User-facing copy for failure codes connectors are known to return. */
const CONNECTOR_REASON_MESSAGES: Record<string, string> = {
  REPOSITORY_NOT_CONNECTED:
    "The configured repository is no longer connected. Pick another in Integrations settings.",
};

/**
 * Translate a failed connector call into a public error. The connector's own
 * failure code (e.g. `REPOSITORY_NOT_CONNECTED`) is kept as the reason so
 * clients can explain it; the raw response body is never exposed.
 */
export const toConnectorError = (error: unknown): unknown => {
  if (isPublicError(error)) {
    return error;
  }

  if (error instanceof RemoteInvokeTimeoutError) {
    return errors.gatewayTimeout(
      "CONNECTOR_TIMEOUT",
      "The integration took too long to respond. Try again in a moment.",
      { cause: error }
    );
  }

  if (error instanceof RemoteInvokeError) {
    const reason = error.reason ?? "CONNECTOR_REQUEST_FAILED";
    return errors.badGateway(
      reason,
      CONNECTOR_REASON_MESSAGES[reason] ??
        "The integration couldn't complete this request",
      { cause: error, details: { upstreamStatus: error.status } }
    );
  }

  // `fetch` rejects with a TypeError when the connector is unreachable.
  if (error instanceof TypeError) {
    return errors.badGateway(
      "CONNECTOR_UNREACHABLE",
      "The integration is unreachable. Try again in a moment.",
      { cause: error }
    );
  }

  return error;
};

/**
 * {@link invokeCapability} with the core's connector secret, rethrowing
 * failures as public errors via {@link toConnectorError}.
 */
export const dispatchCapability = async <Result = unknown>(
  invokeUrl: string,
  envelope: InvokeEnvelope
): Promise<Result> => {
  try {
    return await invokeCapability<Result>(invokeUrl, envelope, {
      secret: connectorInvokeSecret,
    });
  } catch (error) {
    throw toConnectorError(error);
  }
};

/** Provider-neutral reference the connector acts on, straight from the mirror. */
export const buildEntityRef = (
  entity: ExternalEntityRow
): CapabilityEntityRef => ({
  externalKey: entity.externalKey,
  number: entity.number,
  repoFullName: entity.repoFullName,
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
  capability: Capability
) => {
  const integrations = Object.values(
    await db.find(schema.integration, {
      where: { enabled: true, organizationId },
    })
  );

  const integration = integrations.find((i) => i.type === entity.provider);
  if (!integration?.configStr) {
    return null;
  }

  const entry = connectorRegistry.getByType(integration.type);
  if (!entry?.manifest.capabilities.includes(capability)) {
    return null;
  }

  return { entry, integration };
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
  args: { organizationId: string; externalIssueId: string; closed: boolean }
): Promise<void> => {
  try {
    const entity = Object.values(
      await db.find(schema.externalEntity, {
        where: {
          deletedAt: null,
          externalKey: args.externalIssueId,
          organizationId: args.organizationId,
          type: "issue",
        },
      })
    )[0];
    if (!entity) {
      return;
    }

    const state = args.closed ? "closed" : "open";
    // Mirror already reflects the desired state — nothing to push.
    if (entity.state === state) {
      return;
    }

    const target = await resolveEntityCapabilityTarget(
      db,
      args.organizationId,
      entity,
      "issue-tracker"
    );
    if (!target) {
      return;
    }

    await invokeCapability(
      target.entry.invokeUrl,
      {
        capability: "issue-tracker",
        config: target.integration.configStr,
        method: "setState",
        payload: { entity: buildEntityRef(entity), state },
      },
      { secret: connectorInvokeSecret }
    );
  } catch (error) {
    console.error("Failed to sync linked issue state:", error);
  }
};
