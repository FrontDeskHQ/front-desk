import { z } from "zod";

import type { LiveStateFetchClient } from "./live-state";

export interface BackfillStatus {
  processed: number;
  total: number;
  limit: number | null;
  channelsDiscovering: number;
}

const settingsRecordSchema = z.record(z.string(), z.unknown());

/**
 * Parse an opaque `integration.configStr` into a plain object for a generic
 * read-modify-write. Backfill orchestration only merges a couple of keys, so it
 * deliberately does not go through the connector's typed settings schema — but
 * it still validates the value is a plain record and throws otherwise, so a
 * malformed blob or JSON array aborts the write instead of clobbering the
 * settings with only the merged key.
 */
const parseSettingsRecord = (
  configStr: string | null
): Record<string, unknown> => {
  if (!configStr) {
    return {};
  }
  return settingsRecordSchema.parse(JSON.parse(configStr));
};

/**
 * Backfill orchestration helpers bound to a connector's `fetchClient`. These are
 * generic writes to `integration.settings` (via `updateInstallation`) plus the
 * plan-based backfill cap — identical across discord/slack, lifted here.
 *
 * `withBackfillLock` closes over a per-process, per-integration mutex so the
 * status read-modify-write stays serialized within a single connector.
 */
export const createBackfillHelpers = (fetchClient: LiveStateFetchClient) => {
  const backfillLocks = new Map<string, Promise<void>>();

  /** Serialize backfill status read-modify-write operations per integration. */
  const withBackfillLock = async <T>(
    integrationId: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const existing = backfillLocks.get(integrationId) ?? Promise.resolve();
    let releaseLock!: () => void;
    const next = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    backfillLocks.set(integrationId, next);

    try {
      await existing;
      return await fn();
    } finally {
      releaseLock();
      if (backfillLocks.get(integrationId) === next) {
        backfillLocks.delete(integrationId);
      }
    }
  };

  /** Merge the backfill-progress blob into the integration settings. */
  const updateBackfillStatus = async (
    integrationId: string,
    configStr: string | null,
    backfill: BackfillStatus | null
  ) => {
    const current = parseSettingsRecord(configStr);
    await fetchClient.mutate.integration.updateInstallation({
      configStr: JSON.stringify({ ...current, backfill }),
      integrationId,
    });
  };

  /**
   * Merge the synced-channel list into the integration settings. Always re-reads
   * the latest `configStr` first so concurrent status writes are not clobbered.
   */
  const updateSyncedChannels = async (
    integrationId: string,
    syncedChannels: string[]
  ) => {
    const latest = await fetchClient.query.integration.byId({
      id: integrationId,
    });
    const current = parseSettingsRecord(latest?.configStr ?? null);
    await fetchClient.mutate.integration.updateInstallation({
      configStr: JSON.stringify({ ...current, syncedChannels }),
      integrationId,
    });
  };

  /**
   * Trial/free orgs cap backfill at 100 threads; only the paid `pro` plan is
   * uncapped. `starter` and `beta-feedback` are free plans, so they stay capped.
   */
  const getBackfillLimit = async (
    organizationId: string
  ): Promise<number | null> => {
    const subscription = await fetchClient.query.subscription.forOrg({
      organizationId,
    });
    return subscription?.plan === "pro" ? null : 100;
  };

  return {
    getBackfillLimit,
    updateBackfillStatus,
    updateSyncedChannels,
    withBackfillLock,
  };
};
