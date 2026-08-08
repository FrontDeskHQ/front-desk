import { log } from "@workspace/utils/logging";

import { fetchClient } from "../../lib/database/client";
import { errorFields } from "../../lib/logging";

/**
 * Build an idempotency key from processor name and thread ID
 * Format: `processorName:threadId`
 */
export const buildIdempotencyKey = (
  processorName: string,
  threadId: string
): string => `${processorName}:${threadId}`;

/**
 * Batch check idempotency for multiple keys
 *
 * @returns Map of key -> shouldSkip (true if already processed with same hash)
 */
export const batchCheckIdempotency = async (
  keyHashPairs: { key: string; hash: string }[]
): Promise<Map<string, boolean>> => {
  const results = new Map<string, boolean>();

  if (keyHashPairs.length === 0) {
    return results;
  }

  try {
    const keys = keyHashPairs.map((p) => p.key);
    const existingKeys = await fetchClient.query.pipelineIdempotencyKey.byKeys({
      keys,
    });

    const existingMap = new Map<string, string>();
    for (const existing of existingKeys) {
      existingMap.set(existing.key, existing.hash);
    }

    for (const { key, hash } of keyHashPairs) {
      const existingHash = existingMap.get(key);
      if (existingHash === undefined) {
        results.set(key, false);
      } else {
        results.set(key, existingHash === hash);
      }
    }
  } catch (error) {
    log.error({
      action: "worker.idempotency",
      operation: "batch_check",
      keyCount: keyHashPairs.length,
      error: errorFields(error),
    });
    for (const { key } of keyHashPairs) {
      results.set(key, false);
    }
  }

  return results;
};

/**
 * Batch check if idempotency keys exist (regardless of hash)
 * Used to determine if a processor has ever run successfully for a thread
 *
 * @returns Map of key -> exists (true if key exists in database)
 */
export const batchCheckIdempotencyKeyExists = async (
  keys: string[]
): Promise<Map<string, boolean>> => {
  const results = new Map<string, boolean>();

  if (keys.length === 0) {
    return results;
  }

  try {
    const existingKeys = await fetchClient.query.pipelineIdempotencyKey.byKeys({
      keys,
    });

    const existingSet = new Set(existingKeys.map((k) => k.key));

    for (const key of keys) {
      results.set(key, existingSet.has(key));
    }
  } catch (error) {
    log.error({
      action: "worker.idempotency",
      operation: "batch_check_exists",
      keyCount: keys.length,
      error: errorFields(error),
    });
    for (const key of keys) {
      results.set(key, false);
    }
  }

  return results;
};

/**
 * Batch store idempotency keys after successful execution
 */
export const batchStoreIdempotencyKeys = async (
  keyHashPairs: { key: string; hash: string }[]
): Promise<boolean> => {
  if (keyHashPairs.length === 0) {
    return true;
  }

  try {
    await fetchClient.mutate.pipelineIdempotencyKey.batchUpsert({
      entries: keyHashPairs,
    });

    return true;
  } catch (error) {
    log.error({
      action: "worker.idempotency",
      operation: "batch_store",
      keyCount: keyHashPairs.length,
      error: errorFields(error),
    });
    return false;
  }
};
