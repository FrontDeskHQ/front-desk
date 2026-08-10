import { createHash, randomBytes } from "node:crypto";

import { ulid } from "ulid";

import { storage } from "../live-state/storage";

export const CONNECTION_TOKEN_TTL_MS = 60_000;

export type ConnectionPrincipal =
  | { type: "internal" }
  | { apiKeyId: string; organizationId: string; type: "private" };

export interface StoredConnectionToken {
  apiKeyId: string | null;
  consumedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  organizationId: string | null;
  principalType: ConnectionPrincipal["type"];
  tokenHash: string;
}

export interface ConnectionTokenStore {
  cleanup(now: Date, limit: number): Promise<number>;
  consume(tokenHash: string, now: Date): Promise<StoredConnectionToken | null>;
  insert(token: StoredConnectionToken): Promise<void>;
}

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const databaseConnectionTokenStore: ConnectionTokenStore = {
  async cleanup(now, limit) {
    const expired = await storage.internalDB
      .selectFrom("connectionToken")
      .select("id")
      .where("expiresAt", "<=", now)
      .limit(limit)
      .execute();

    const ids = expired.map(({ id }) => id as string);
    if (ids.length === 0) {
      return 0;
    }

    await storage.internalDB
      .deleteFrom("connectionToken")
      .where("id", "in", ids)
      .execute();
    return ids.length;
  },
  async consume(tokenHash, now) {
    const row = await storage.internalDB
      .updateTable("connectionToken")
      .set({ consumedAt: now })
      .where("tokenHash", "=", tokenHash)
      .where("consumedAt", "is", null)
      .where("expiresAt", ">", now)
      .returningAll()
      .executeTakeFirst();

    return (row as StoredConnectionToken | undefined) ?? null;
  },
  async insert(token) {
    await storage.internalDB
      .insertInto("connectionToken")
      .values(token)
      .execute();
  },
};

export const createConnectionTokenService = (
  store: ConnectionTokenStore,
  options: {
    cleanupBatchSize?: number;
    cleanupEvery?: number;
    now?: () => Date;
    onCleanupError?: (error: unknown) => void;
    randomToken?: () => string;
  } = {}
) => {
  const now = options.now ?? (() => new Date());
  const cleanupBatchSize = options.cleanupBatchSize ?? 1000;
  const cleanupEvery = options.cleanupEvery ?? 100;
  const onCleanupError =
    options.onCleanupError ??
    ((error: unknown) =>
      console.error("connection_token.cleanup_failed", error));
  const randomToken =
    options.randomToken ??
    (() => `fd_ct_${randomBytes(32).toString("base64url")}`);
  let mintsSinceCleanup = 0;

  return {
    async consume(token: string): Promise<ConnectionPrincipal | null> {
      const row = await store.consume(hashToken(token), now());
      if (!row) {
        return null;
      }

      if (
        row.principalType === "private" &&
        row.apiKeyId &&
        row.organizationId
      ) {
        return {
          apiKeyId: row.apiKeyId,
          organizationId: row.organizationId,
          type: "private",
        };
      }

      return row.principalType === "internal" ? { type: "internal" } : null;
    },

    async mint(principal: ConnectionPrincipal): Promise<{
      expiresAt: string;
      token: string;
    }> {
      const token = randomToken();
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + CONNECTION_TOKEN_TTL_MS);

      await store.insert({
        apiKeyId: principal.type === "private" ? principal.apiKeyId : null,
        consumedAt: null,
        createdAt,
        expiresAt,
        id: ulid().toLowerCase(),
        organizationId:
          principal.type === "private" ? principal.organizationId : null,
        principalType: principal.type,
        tokenHash: hashToken(token),
      });

      mintsSinceCleanup += 1;
      if (mintsSinceCleanup >= cleanupEvery) {
        mintsSinceCleanup = 0;
        await store.cleanup(createdAt, cleanupBatchSize).catch(onCleanupError);
      }

      return { expiresAt: expiresAt.toISOString(), token };
    },
  };
};

export const connectionTokens = createConnectionTokenService(
  databaseConnectionTokenStore
);
