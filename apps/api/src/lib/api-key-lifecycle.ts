import { addYears } from "date-fns";
import type { ApiKeyRecord } from "keypal";

type ApiKeyType = "private" | "public";

/** Defaults to a year out; anything later, past, or unparseable is rejected. */
export const resolvePrivateApiKeyExpiration = (input: {
  expiresAt?: string;
  now?: Date;
}): Date => {
  const now = input.now ?? new Date();
  const latest = addYears(now, 1);
  const expiration = input.expiresAt ? new Date(input.expiresAt) : latest;

  // The ceiling is a calendar day, not an instant: the UI sends a date-only
  // value, so a key created at noon may still expire a year out at midnight.
  if (
    Number.isNaN(expiration.getTime()) ||
    expiration <= now ||
    expiration.toISOString().slice(0, 10) > latest.toISOString().slice(0, 10)
  ) {
    throw new Error("INVALID_PRIVATE_API_KEY_EXPIRATION");
  }

  return expiration;
};

// Expired keys remain visible so owners can audit and revoke them. Only revoked
// rows are hidden from the normal management list.
export const listUnrevokedApiKeys = (
  publicApiKeys: ApiKeyRecord[],
  privateApiKeys: ApiKeyRecord[]
) => [
  ...unrevoked(publicApiKeys, "public"),
  ...unrevoked(privateApiKeys, "private"),
];

const unrevoked = (apiKeys: ApiKeyRecord[], type: ApiKeyType) =>
  apiKeys
    .filter((apiKey) => !apiKey.metadata.revokedAt)
    .map((apiKey) => ({
      createdAt: apiKey.metadata.createdAt,
      expiresAt: apiKey.metadata.expiresAt,
      id: apiKey.id,
      name: apiKey.metadata.name,
      type,
    }));
