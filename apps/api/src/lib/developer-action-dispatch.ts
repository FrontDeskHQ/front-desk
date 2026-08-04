import { invokeDeveloperAction } from "@connectors/framework";
import type { RegistryEntry } from "@connectors/framework";
import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";
import { z } from "zod";

import { schema } from "../live-state/schema";
import {
  connectorRegistry,
  getConnectorInvokeSecret,
} from "./connector-registry";
import { buildEntityRef } from "./capability-dispatch";

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

const LOCAL_DEVELOPMENT_ENVIRONMENTS = new Set([
  "development",
  "local",
  "test",
]);

const isLocalDevelopment = (): boolean => {
  const environment = process.env.NODE_ENV;
  return (
    environment !== undefined &&
    LOCAL_DEVELOPMENT_ENVIRONMENTS.has(environment.toLowerCase())
  );
};

const isLoopbackHost = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

const assertSafeActionInvokeTarget = (
  actionInvokeUrl: string,
  secret: string | null
): void => {
  if (!secret) {
    throw new DeveloperActionError("CONNECTOR_INVOKE_SECRET_NOT_CONFIGURED");
  }

  let url: URL;
  try {
    url = new URL(actionInvokeUrl);
  } catch {
    throw new DeveloperActionError("INVALID_CONNECTOR_ACTION_URL");
  }

  const isExplicitLocalTarget =
    isLocalDevelopment() &&
    url.protocol === "http:" &&
    isLoopbackHost(url.hostname);
  if (url.protocol !== "https:" && !isExplicitLocalTarget) {
    throw new DeveloperActionError("INSECURE_CONNECTOR_ACTION_URL");
  }
};

export interface DeveloperActionTarget {
  config: string;
  entry: RegistryEntry;
}

type ExternalEntityRow = InferLiveObject<typeof schema.externalEntity>;

const prMatchReplayInputSchema = z
  .object({
    entityId: z.string().min(1),
  })
  .strict();

const repositoryBackfillInputSchema = z
  .object({
    allRepositories: z.boolean().optional(),
    repositories: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const allRepositories = input.allRepositories === true;
    const repositories = input.repositories ?? [];

    if (allRepositories && repositories.length > 0) {
      context.addIssue({
        code: "custom",
        message: "allRepositories cannot be combined with repositories",
        path: ["repositories"],
      });
    }

    if (!allRepositories && repositories.length === 0) {
      context.addIssue({
        code: "custom",
        message: "repositories or allRepositories is required",
        path: ["repositories"],
      });
    }
  });

type ParsedDeveloperActionInput =
  | { action: "pr_match_replay"; entityId: string }
  | {
      action: "repository_backfill";
      allRepositories: boolean;
      repositories: string[];
    };

const parseDeveloperActionInput = (args: {
  action: string;
  payload: Record<string, unknown>;
}): ParsedDeveloperActionInput => {
  if (args.action === "pr_match_replay") {
    const parsed = prMatchReplayInputSchema.safeParse(args.payload);
    if (!parsed.success) {
      throw new DeveloperActionError("INVALID_DEVELOPER_ACTION_INPUT");
    }
    return { action: args.action, entityId: parsed.data.entityId };
  }

  if (args.action === "repository_backfill") {
    const parsed = repositoryBackfillInputSchema.safeParse(args.payload);
    if (!parsed.success) {
      throw new DeveloperActionError("INVALID_DEVELOPER_ACTION_INPUT");
    }
    return {
      action: args.action,
      allRepositories: parsed.data.allRepositories === true,
      repositories: [...new Set(parsed.data.repositories ?? [])],
    };
  }

  throw new DeveloperActionError("UNKNOWN_DEVELOPER_ACTION");
};

/**
 * Resolve browser-facing action input into the provider-neutral payload the
 * connector needs. Entity IDs are looked up with both organization and PR
 * type filters so a caller cannot turn an ID from another organization or
 * another mirrored entity kind into a connector target.
 */
export const resolveDeveloperActionPayload = async (
  db: Pick<ServerDB<typeof schema>, "find">,
  args: {
    action: string;
    connectorType: string;
    organizationId: string;
    payload: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> => {
  const input = parseDeveloperActionInput(args);

  if (input.action === "pr_match_replay") {
    const entity = Object.values(
      await db.find(schema.externalEntity, {
        where: {
          deletedAt: null,
          id: input.entityId,
          organizationId: args.organizationId,
          provider: args.connectorType,
          type: "pull_request",
        },
      })
    )[0] as ExternalEntityRow | undefined;

    if (!entity) {
      throw new DeveloperActionError("INVALID_DEVELOPER_ACTION_TARGET");
    }

    return {
      organizationId: args.organizationId,
      target: buildEntityRef(entity),
    };
  }

  return {
    allRepositories: input.allRepositories,
    organizationId: args.organizationId,
    repositories: input.repositories,
  };
};

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
  let payload: Record<string, unknown>;
  try {
    target = await resolveDeveloperActionTarget(db, args);
    payload = await resolveDeveloperActionPayload(db, args);
  } catch (error) {
    if (error instanceof DeveloperActionError) {
      throw error;
    }
    throw new DeveloperActionError("DEVELOPER_ACTION_FAILED");
  }

  const connectorSecret = getConnectorInvokeSecret();
  assertSafeActionInvokeTarget(target.entry.actionInvokeUrl, connectorSecret);

  let rawResult: unknown;
  try {
    rawResult = await invokeDeveloperAction(
      target.entry.actionInvokeUrl,
      {
        action: args.action,
        config: target.config,
        payload,
      },
      { secret: connectorSecret }
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
