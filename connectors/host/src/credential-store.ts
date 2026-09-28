import type { LiveStateFetchClient } from "@connectors/framework/runtime";

import type { AuthorizationCore } from "./provider";

export interface StoredCredential {
  credential: unknown;
  organizationId: string;
  /** Pass back as `expectedVersion` when rotating. */
  version: number;
}

/**
 * Core-held integration credentials (ADR-0024). The value is opaque here;
 * each connector validates its own shape.
 */
export interface IntegrationCredentialStore {
  read(
    integrationId: string,
    options?: { signal?: AbortSignal }
  ): Promise<StoredCredential | null>;
  /** Compare-and-swap. `ok: false` means another writer got there first. */
  write(
    integrationId: string,
    credential: unknown,
    expectedVersion: number,
    options?: { signal?: AbortSignal }
  ): Promise<{ ok: boolean; version: number }>;
}

const withSignal = async <T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  if (!signal) return promise;
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
};

export const createCredentialStore = (
  fetchClient: LiveStateFetchClient
): IntegrationCredentialStore => ({
  read: (integrationId, options) =>
    withSignal(
      fetchClient.mutate.integration.readCredential({ integrationId }),
      options?.signal
    ),
  write: (integrationId, credential, expectedVersion, options) =>
    withSignal(
      fetchClient.mutate.integration.writeCredential({
        credential,
        expectedVersion,
        integrationId,
      }),
      options?.signal
    ),
});

export const createAuthorizationCore = (
  fetchClient: LiveStateFetchClient,
  frontendBaseUrl: string
): AuthorizationCore => ({
  complete: async (input) => {
    await fetchClient.mutate.integration.completeAuthorization(input);
  },
  frontendBaseUrl,
  readConfig: async (integrationId) => {
    const integration = await fetchClient.query.integration.byId({
      id: integrationId,
    });
    return integration?.configStr ?? null;
  },
});
