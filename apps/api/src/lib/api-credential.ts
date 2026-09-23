import { createHash, timingSafeEqual } from "node:crypto";

import type { ApiKeyRecord } from "keypal";

import { privateKeys, publicKeys } from "./api-key";
import type { AuthorizationContext, WidgetIdentity } from "./authorize";
import { connectionTokens } from "./connection-token";
import type { ConnectionPrincipal } from "./connection-token";
import { errors, getErrorReason } from "./errors";
import {
  isWidgetIdentityActive,
  isWidgetToken,
  resolveWidgetIdentity,
} from "./widget-identity";

type ApiCredentialContext = Pick<
  AuthorizationContext,
  "internalApiKey" | "privateApiKey" | "publicApiKey" | "widgetIdentity"
>;

export interface CredentialDependencies {
  internalKey?: string;
  verifyPrivate: (key: string) => Promise<ApiKeyRecord | null>;
  verifyPublic: (key: string) => Promise<ApiKeyRecord | null>;
  verifyWidget?: (
    token: string,
    organizationId: string,
    origin?: string
  ) => Promise<WidgetIdentity | null>;
}

// Revoked, expired, unknown, and wrong-environment keys all get the same
// answer so the response does not reveal which keys exist.
const invalidCredential = () =>
  errors.unauthorized(
    "INVALID_API_CREDENTIAL",
    "The API credential is invalid, expired, or revoked"
  );

const conflictingCredentials = () =>
  errors.unauthorized(
    "CONFLICTING_API_CREDENTIALS",
    "Send exactly one API credential per request"
  );

/** Name of the credential failure, for logging. */
export const credentialErrorMessage = (error: unknown): string =>
  getErrorReason(error) ??
  (error instanceof Error ? error.message : "UNKNOWN_ERROR");

/** Resolve at most one explicit HTTP API credential. Cookies are passive. */
export const resolveHttpApiCredential = async (
  headers: Record<string, string | undefined>,
  dependencies: CredentialDependencies = defaultDependencies
): Promise<ApiCredentialContext | null> => {
  const internalKey = headers["x-discord-bot-key"];
  const publicKey = headers["x-public-api-key"];
  const authorization = headers.authorization;
  const bearer = authorization
    ? /^Bearer\s+(\S+)$/i.exec(authorization.trim())?.[1]
    : undefined;
  const isWidgetBearer =
    internalKey === undefined &&
    publicKey !== undefined &&
    bearer !== undefined &&
    isWidgetToken(bearer);

  const explicit = [internalKey, publicKey, authorization].filter(
    (value) => value !== undefined
  );
  if (explicit.length > 1 && !isWidgetBearer) {
    throw conflictingCredentials();
  }

  if (internalKey !== undefined) {
    if (
      !dependencies.internalKey ||
      !secretsMatch(internalKey, dependencies.internalKey)
    ) {
      throw invalidCredential();
    }
    return { internalApiKey: true };
  }

  if (publicKey !== undefined) {
    const record = await dependencies.verifyPublic(publicKey);
    if (!record) {
      throw invalidCredential();
    }

    const publicApiKey = {
      id: record.id,
      ownerId: record.metadata.ownerId,
    };
    if (authorization !== undefined) {
      if (!bearer || !isWidgetToken(bearer)) {
        throw conflictingCredentials();
      }
      const identity = await dependencies.verifyWidget?.(
        bearer,
        publicApiKey.ownerId,
        headers.origin
      );
      if (!identity || identity.organizationId !== publicApiKey.ownerId) {
        throw invalidCredential();
      }
      return { publicApiKey, widgetIdentity: identity };
    }

    return { publicApiKey };
  }

  if (authorization !== undefined) {
    if (!bearer) {
      throw invalidCredential();
    }

    // A JWT without the publishable key cannot identify an organization, so
    // it is never treated as a private API key or accepted on its own.
    if (isWidgetToken(bearer)) {
      throw invalidCredential();
    }

    const record = await dependencies.verifyPrivate(bearer);
    if (!record) {
      throw invalidCredential();
    }
    return {
      privateApiKey: { id: record.id, ownerId: record.metadata.ownerId },
    };
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
    throw conflictingCredentials();
  }

  if (queryParams.publicApiKey) {
    const record = await verifyPublic(queryParams.publicApiKey);
    if (!record) {
      throw invalidCredential();
    }
    return {
      publicApiKey: { id: record.id, ownerId: record.metadata.ownerId },
    };
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

  if (credential.widgetIdentity && credential.publicApiKey) {
    const apiKeyId = credential.publicApiKey.id;
    if (!apiKeyId) {
      throw new Error("PUBLIC_API_KEY_ID_REQUIRED");
    }

    return connectionTokens.mint({
      apiKeyId,
      email: credential.widgetIdentity.email ?? null,
      name: credential.widgetIdentity.name,
      organizationId: credential.widgetIdentity.organizationId,
      type: "widget",
      userId: credential.widgetIdentity.userId,
      widgetKeyVersion: credential.widgetIdentity.keyVersion,
    });
  }

  if (credential.internalApiKey) {
    return connectionTokens.mint({ type: "internal" });
  }

  throw errors.unauthorized();
};

/**
 * Rebuild the authorization context a connection token stands for. Private keys
 * are re-read so a key revoked between minting and connecting is refused.
 */
export const resolveConnectionPrincipal = async (
  principal: ConnectionPrincipal,
  findPrivateKey: (id: string) => Promise<ApiKeyRecord | null> = (id) =>
    privateKeys.findById(id),
  findPublicKey: (id: string) => Promise<ApiKeyRecord | null> = (id) =>
    publicKeys.findById(id),
  widgetIdentityIsActive: (
    identity: Pick<WidgetIdentity, "keyVersion" | "organizationId">
  ) => Promise<boolean> = isWidgetIdentityActive
): Promise<ApiCredentialContext | null> => {
  if (principal.type === "internal") {
    return { internalApiKey: true };
  }

  if (principal.type === "widget") {
    const record = await findPublicKey(principal.apiKeyId);
    if (
      !record ||
      record.metadata.ownerId !== principal.organizationId ||
      !isUsable(record) ||
      !(await widgetIdentityIsActive({
        keyVersion: principal.widgetKeyVersion,
        organizationId: principal.organizationId,
      }))
    ) {
      return null;
    }

    return {
      publicApiKey: { id: record.id, ownerId: record.metadata.ownerId },
      widgetIdentity: {
        email: principal.email ?? undefined,
        keyVersion: principal.widgetKeyVersion,
        name: principal.name,
        organizationId: principal.organizationId,
        userId: principal.userId,
      },
    };
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
  verifyWidget: (token, organizationId, origin) =>
    resolveWidgetIdentity({
      organizationId,
      origin,
      token,
    }),
};
