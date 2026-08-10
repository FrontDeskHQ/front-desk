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

const getHeader = (
  headers: Record<string, string | undefined>,
  name: string
): string | undefined => {
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === target
  );
  return entry?.[1];
};

const verifiedRecord = async (
  manager: typeof privateKeys | typeof publicKeys,
  key: string
): Promise<ApiKeyRecord | null> => {
  const result = await manager.verify(key);
  return result.valid && result.record ? result.record : null;
};

const defaultDependencies: CredentialDependencies = {
  internalKey: process.env.DISCORD_BOT_KEY,
  verifyPrivate: (key) => verifiedRecord(privateKeys, key),
  verifyPublic: (key) => verifiedRecord(publicKeys, key),
};

const secretsMatch = (provided: string, expected: string): boolean => {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
};

export const isApiKeyRecordUsable = (
  record: ApiKeyRecord,
  now = new Date()
): boolean => {
  const { enabled, expiresAt, revokedAt } = record.metadata;
  return (
    enabled !== false &&
    !revokedAt &&
    (!expiresAt || new Date(expiresAt).getTime() > now.getTime())
  );
};

/** Resolve at most one explicit HTTP API credential. Cookies are passive. */
export const resolveHttpApiCredential = async (
  headers: Record<string, string | undefined>,
  dependencies: CredentialDependencies = defaultDependencies
): Promise<ApiCredentialContext | null> => {
  const internalKey = getHeader(headers, "x-discord-bot-key");
  const publicKey = getHeader(headers, "x-public-api-key");
  const authorization = getHeader(headers, "authorization");
  const explicitCredentials = [internalKey, publicKey, authorization].filter(
    (value) => value !== undefined
  );

  if (explicitCredentials.length > 1) {
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
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    if (!match?.[1]) {
      throw new Error("INVALID_API_CREDENTIAL");
    }

    const record = await dependencies.verifyPrivate(match[1]);
    if (!record) {
      throw new Error("INVALID_API_CREDENTIAL");
    }
    return {
      privateApiKey: {
        id: record.id,
        ownerId: record.metadata.ownerId,
      },
    };
  }

  return null;
};

/** Resolve API principals on WebSockets; session tokens fall through to auth. */
export const resolveWebSocketApiCredential = async (
  queryParams: Record<string, string | undefined>,
  dependencies: {
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
    const verifyPublic =
      dependencies.verifyPublic ?? defaultDependencies.verifyPublic;
    const record = await verifyPublic(queryParams.publicApiKey);
    if (!record) {
      throw new Error("INVALID_API_CREDENTIAL");
    }
    return { publicApiKey: { ownerId: record.metadata.ownerId } };
  }

  if (!queryParams.token) {
    return null;
  }

  const consumeToken = dependencies.consumeToken ?? consumeApiConnectionToken;
  return consumeToken(queryParams.token);
};

export const consumeApiConnectionToken = async (
  token: string
): Promise<ApiCredentialContext | null> => {
  const principal = await connectionTokens.consume(token);
  if (!principal) {
    return null;
  }

  return resolveConnectionPrincipal(principal);
};

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
    !isApiKeyRecordUsable(record)
  ) {
    return null;
  }

  return {
    privateApiKey: {
      id: record.id,
      ownerId: record.metadata.ownerId,
    },
  };
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
