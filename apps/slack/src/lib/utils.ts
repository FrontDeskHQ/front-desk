import { slackIntegrationSchema } from "@workspace/schemas/integration/slack";
import type z from "zod";
import { fetchClient } from "./live-state";

export const updateBackfillStatus = async (
  integrationId: string,
  configStr: string | null,
  backfill: { processed: number; total: number } | null,
) => {
  const current = safeParseIntegrationSettings(configStr);
  await fetchClient.mutate.integration.update(integrationId, {
    configStr: JSON.stringify({ ...current, backfill }),
  });
};

// Per-integration async mutex to serialize backfill status read-modify-write operations
const backfillLocks = new Map<string, Promise<void>>();

export const withBackfillLock = async <T>(
  integrationId: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const existing = backfillLocks.get(integrationId) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  backfillLocks.set(integrationId, next);

  try {
    await existing;
    return await fn();
  } finally {
    resolve!();
    if (backfillLocks.get(integrationId) === next) {
      backfillLocks.delete(integrationId);
    }
  }
};

export const safeParseIntegrationSettings = (
  configStr: string | null,
): z.infer<typeof slackIntegrationSchema> | undefined => {
  if (!configStr) return undefined;
  try {
    return slackIntegrationSchema.parse(JSON.parse(configStr));
  } catch {
    return undefined;
  }
};
