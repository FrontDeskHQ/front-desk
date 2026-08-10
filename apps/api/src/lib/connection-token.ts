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
  consume(tokenHash: string, now: Date): Promise<StoredConnectionToken | null>;
  insert(token: StoredConnectionToken): Promise<void>;
}

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const databaseTokenStore: ConnectionTokenStore = {
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

export const createConnectionTokens = (
  store: ConnectionTokenStore,
  options: {
    now?: () => Date;
    randomToken?: () => string;
  } = {}
) => {
  const now = options.now ?? (() => new Date());
  const randomToken =
    options.randomToken ??
    (() => `fd_ct_${randomBytes(32).toString("base64url")}`);

  return {
    async consume(token: string): Promise<ConnectionPrincipal | null> {
      const row = await store.consume(hashToken(token), now());
      if (!row) {
        return null;
      }

      if (row.principalType === "internal") {
        return { type: "internal" };
      }

      if (!row.apiKeyId || !row.organizationId) {
        return null;
      }

      return {
        apiKeyId: row.apiKeyId,
        organizationId: row.organizationId,
        type: "private",
      };
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

      return { expiresAt: expiresAt.toISOString(), token };
    },
  };
};

export const connectionTokens = createConnectionTokens(databaseTokenStore);
