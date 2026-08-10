import { createHash, timingSafeEqual } from "node:crypto";

import type { ApiKeyRecord } from "keypal";

import { privateKeys, publicKeys } from "./api-key";
import type { AuthorizationContext } from "./authorize";
import { connectionTokens } from "./connection-token";
import type { ConnectionPrincipal } from "./connection-token";

type ApiCredentialContext = Pick<
  AuthorizationContext,
  "internalApiKey" | "privateApiKey" | "publicApiKey"
>;

interface CredentialDependencies {
  internalKey?: string;
  verifyPrivate: (key: string) => Promise<ApiKeyRecord | null>;
  verifyPublic: (key: string) => Promise<ApiKeyRecord | null>;
}

/** Resolve at most one explicit HTTP API credential. Cookies are passive. */
export const resolveHttpApiCredential = async (
  headers: Record<string, string | undefined>,
  dependencies: CredentialDependencies = defaultDependencies
): Promise<ApiCredentialContext | null> => {
  const internalKey = headers["x-discord-bot-key"];
  const publicKey = headers["x-public-api-key"];
  const authorization = headers.authorization;

  const explicit = [internalKey, publicKey, authorization].filter(
    (value) => value !== undefined
  );
  if (explicit.length > 1) {
    throw new Error("CONFLICTING_API_CREDENTIALS");
  }

  if (internalKey !== undefined) {
    if (
      !dependencies.internalKey ||
      !secretsMatch(internalKey, dependencies.internalKey)
    ) {
      throw new Error("INVALID_API_CREDENTIAL");
    }
    return { internalApiKey: true };
  }

  if (publicKey !== undefined) {
    const record = await dependencies.verifyPublic(publicKey);
    if (!record) {
      throw new Error("INVALID_API_CREDENTIAL");
    }
    return { publicApiKey: { ownerId: record.metadata.ownerId } };
  }

  if (authorization !== undefined) {
    const bearer = /^Bearer\s+(\S+)$/i.exec(authorization.trim())?.[1];
    if (!bearer) {
      throw new Error("INVALID_API_CREDENTIAL");
    }

    const record = await dependencies.verifyPrivate(bearer);
    if (!record) {
      throw new Error("INVALID_API_CREDENTIAL");
    }
    return { privateApiKey: { id: record.id, ownerId: record.metadata.ownerId } };
  }

  return null;
};

/** Resolve API principals on WebSockets; session tokens fall through to auth. */
export const resolveWebSocketApiCredential = async (
  queryParams: Record<string, string | undefined>,
  {
    consumeToken = consumeConnectionToken,
    verifyPublic = defaultDependencies.verifyPublic,
  }: {
    consumeToken?: (token: string) => Promise<ApiCredentialContext | null>;
    verifyPublic?: (key: string) => Promise<ApiKeyRecord | null>;
  } = {}
): Promise<ApiCredentialContext | null> => {
  if (
    queryParams.token &&
    (queryParams.discordBotKey || queryParams.publicApiKey)
  ) {
    throw new Error("CONFLICTING_API_CREDENTIALS");
  }

  if (queryParams.publicApiKey) {
    const record = await verifyPublic(queryParams.publicApiKey);
    if (!record) {
      throw new Error("INVALID_API_CREDENTIAL");
    }
    return { publicApiKey: { ownerId: record.metadata.ownerId } };
  }

  if (!queryParams.token) {
    return null;
  }

  return consumeToken(queryParams.token);
};

export const mintApiConnectionToken = async (
  credential: ApiCredentialContext
): Promise<{ expiresAt: string; token: string }> => {
  if (credential.privateApiKey) {
    return connectionTokens.mint({
      apiKeyId: credential.privateApiKey.id,
      organizationId: credential.privateApiKey.ownerId,
      type: "private",
    });
  }

  if (credential.internalApiKey) {
    return connectionTokens.mint({ type: "internal" });
  }

  throw new Error("UNAUTHORIZED");
};

/**
 * Rebuild the authorization context a connection token stands for. Private keys
 * are re-read so a key revoked between minting and connecting is refused.
 */
export const resolveConnectionPrincipal = async (
  principal: ConnectionPrincipal,
  findPrivateKey: (id: string) => Promise<ApiKeyRecord | null> = (id) =>
    privateKeys.findById(id)
): Promise<ApiCredentialContext | null> => {
  if (principal.type === "internal") {
    return { internalApiKey: true };
  }

  const record = await findPrivateKey(principal.apiKeyId);
  if (
    !record ||
    record.metadata.ownerId !== principal.organizationId ||
    !isUsable(record)
  ) {
    return null;
  }

  return { privateApiKey: { id: record.id, ownerId: record.metadata.ownerId } };
};

const consumeConnectionToken = async (
  token: string
): Promise<ApiCredentialContext | null> => {
  const principal = await connectionTokens.consume(token);
  return principal ? resolveConnectionPrincipal(principal) : null;
};

const isUsable = (record: ApiKeyRecord): boolean => {
  const { enabled, expiresAt, revokedAt } = record.metadata;
  return (
    enabled !== false &&
    !revokedAt &&
    (!expiresAt || new Date(expiresAt).getTime() > Date.now())
  );
};

const verifyKey = async (
  keys: typeof privateKeys | typeof publicKeys,
  key: string
): Promise<ApiKeyRecord | null> => {
  const result = await keys.verify(key);
  return result.valid && result.record ? result.record : null;
};

const secretsMatch = (provided: string, expected: string): boolean => {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
};

const defaultDependencies: CredentialDependencies = {
  internalKey: process.env.DISCORD_BOT_KEY,
  verifyPrivate: (key) => verifyKey(privateKeys, key),
  verifyPublic: (key) => verifyKey(publicKeys, key),
};
