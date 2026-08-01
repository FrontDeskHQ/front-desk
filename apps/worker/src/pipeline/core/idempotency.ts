import { log } from "@workspace/utils/logging";
import { ulid } from "ulid";

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
 * Check if a processor should run based on idempotency key and hash
 *
 * @returns true if the processor should be skipped (already processed with same hash)
 * @returns false if the processor should run (new or hash changed)
 */
export const checkIdempotency = async (
  key: string,
  hash: string
): Promise<boolean> => {
  try {
    const existing = (
      await fetchClient.query.pipelineIdempotencyKey.byKeys({ keys: [key] })
    )[0];

    if (!existing) {
      return false;
    }

    return existing.hash === hash;
  } catch (error) {
    log.error({
      action: "worker.idempotency",
      operation: "check",
      key,
      error: errorFields(error),
    });
    return false;
  }
};

/**
 * Store or update an idempotency key after successful execution
 */
export const storeIdempotencyKey = async (
  key: string,
  hash: string
): Promise<boolean> => {
  try {
    await fetchClient.mutate.pipelineIdempotencyKey.upsert({
      createdAt: new Date(),
      hash,
      id: ulid().toLowerCase(),
      key,
    });

    return true;
  } catch (error) {
    log.error({
      action: "worker.idempotency",
      operation: "store",
      key,
      error: errorFields(error),
    });
    return false;
  }
};

/**
 * Invalidate an idempotency key by setting an empty hash
 * This forces the processor to run again on the next execution.
 */
export const invalidateIdempotencyKey = async (
  key: string
): Promise<boolean> => {
  try {
    await fetchClient.mutate.pipelineIdempotencyKey.invalidate({ key });

    return true;
  } catch (error) {
    log.error({
      action: "worker.idempotency",
      operation: "invalidate",
      key,
      error: errorFields(error),
    });
    return false;
  }
};

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
