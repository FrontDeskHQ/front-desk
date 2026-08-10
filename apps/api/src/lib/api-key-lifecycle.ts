import { addYears } from "date-fns";
import type { ApiKeyRecord } from "keypal";

export const resolvePrivateApiKeyExpiration = (input: {
  expiresAt?: string;
  featureEnabled: boolean;
  now?: Date;
}): Date => {
  if (!input.featureEnabled) {
    throw new Error("FEATURE_NOT_AVAILABLE");
  }

  const now = input.now ?? new Date();
  const maximumExpiration = addYears(now, 1);
  const expiration = input.expiresAt
    ? new Date(input.expiresAt)
    : maximumExpiration;

  if (
    Number.isNaN(expiration.getTime()) ||
    expiration <= now ||
    expiration > maximumExpiration
  ) {
    throw new Error("INVALID_PRIVATE_API_KEY_EXPIRATION");
  }

  return expiration;
};

export const listActiveApiKeys = (
  publicApiKeys: ApiKeyRecord[],
  privateApiKeys: ApiKeyRecord[]
) =>
  [
    ...publicApiKeys.map((apiKey) => ({
      apiKey,
      type: "public" as const,
    })),
    ...privateApiKeys.map((apiKey) => ({
      apiKey,
      type: "private" as const,
    })),
  ]
    .filter(({ apiKey }) => !apiKey.metadata.revokedAt)
    .map(({ apiKey, type }) => ({
      createdAt: apiKey.metadata.createdAt,
      expiresAt: apiKey.metadata.expiresAt,
      id: apiKey.id,
      name: apiKey.metadata.name,
      type,
    }));
