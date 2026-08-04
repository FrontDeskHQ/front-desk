import { invokeDeveloperAction } from "@connectors/framework";
import type { RegistryEntry } from "@connectors/framework";
import type { ServerDB } from "@live-state/sync/server";
import { z } from "zod";

import { schema } from "../live-state/schema";
import { connectorInvokeSecret, connectorRegistry } from "./connector-registry";

/**
 * Explicit developer actions known to the API. This is intentionally separate
 * from connector capabilities and is extended when a new action is shipped.
 */
export const DEVELOPER_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  github: ["pr_match_replay", "repository_backfill"],
};

export const isKnownDeveloperAction = (
  connectorType: string,
  action: string
): boolean => DEVELOPER_ACTIONS[connectorType]?.includes(action) ?? false;

export class DeveloperActionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "DeveloperActionError";
  }
}

export const developerActionAcceptedResultSchema = z
  .object({
    accepted: z.literal(true),
    jobIds: z.array(z.string().min(1)).default([]),
    target: z.string().min(1).optional(),
  })
  .strict();

export type DeveloperActionAcceptedResult = z.infer<
  typeof developerActionAcceptedResultSchema
>;

export interface DeveloperActionTarget {
  config: string;
  entry: RegistryEntry;
}

export const resolveDeveloperActionTarget = async (
  db: Pick<ServerDB<typeof schema>, "find">,
  args: {
    action: string;
    connectorType: string;
    organizationId: string;
  }
): Promise<DeveloperActionTarget> => {
  if (!isKnownDeveloperAction(args.connectorType, args.action)) {
    throw new DeveloperActionError("UNKNOWN_DEVELOPER_ACTION");
  }

  const entry = connectorRegistry.getByType(args.connectorType);
  if (!entry) {
    throw new DeveloperActionError("UNKNOWN_CONNECTOR_TYPE");
  }

  const integrations = Object.values(
    await db.find(schema.integration, {
      where: { enabled: true, organizationId: args.organizationId },
    })
  ).filter((integration) => integration.type === args.connectorType);

  if (integrations.length !== 1) {
    throw new DeveloperActionError("INTEGRATION_NOT_CONFIGURED");
  }

  const integration = integrations[0];
  if (!integration?.configStr) {
    throw new DeveloperActionError("INTEGRATION_NOT_CONFIGURED");
  }

  return { config: integration.configStr, entry };
};

export const dispatchDeveloperAction = async (
  db: Pick<ServerDB<typeof schema>, "find">,
  args: {
    action: string;
    connectorType: string;
    organizationId: string;
    payload: Record<string, unknown>;
  }
): Promise<DeveloperActionAcceptedResult> => {
  let target: DeveloperActionTarget;
  try {
    target = await resolveDeveloperActionTarget(db, args);
  } catch (error) {
    if (error instanceof DeveloperActionError) {
      throw error;
    }
    throw new DeveloperActionError("DEVELOPER_ACTION_FAILED");
  }

  let rawResult: unknown;
  try {
    rawResult = await invokeDeveloperAction(
      target.entry.actionInvokeUrl,
      {
        action: args.action,
        config: target.config,
        payload: args.payload,
      },
      { secret: connectorInvokeSecret }
    );
  } catch {
    throw new DeveloperActionError("DEVELOPER_ACTION_FAILED");
  }

  const result = developerActionAcceptedResultSchema.safeParse(rawResult);
  if (!result.success) {
    throw new DeveloperActionError("DEVELOPER_ACTION_NOT_ACCEPTED");
  }

  return result.data;
};
