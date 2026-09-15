import { createHash, randomBytes } from "node:crypto";

import { ulid } from "ulid";

import { storage } from "../live-state/storage";

export const CONNECTION_TOKEN_TTL_MS = 60_000;

export type ConnectionPrincipal =
  | { type: "internal" }
  | { apiKeyId: string; organizationId: string; type: "private" }
  | {
      email: string | null;
      name: string;
      organizationId: string;
      type: "widget";
      userId: string;
    };

export interface StoredConnectionToken {
  apiKeyId: string | null;
  consumedAt: Date | null;
  createdAt: Date;
  email: string | null;
  expiresAt: Date;
  id: string;
  name: string | null;
  organizationId: string | null;
  principalType: ConnectionPrincipal["type"];
  tokenHash: string;
  userId: string | null;
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

      // principalType is a plain string column, so an unrecognized value must
      // fail closed rather than fall through to the private branch.
      if (
        row.principalType !== "private" ||
        !row.apiKeyId ||
        !row.organizationId
      ) {
        if (
          row.principalType !== "widget" ||
          !row.organizationId ||
          !row.userId ||
          !row.name
        ) {
          return null;
        }

        return {
          email: row.email,
          name: row.name,
          organizationId: row.organizationId,
          type: "widget",
          userId: row.userId,
        };
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
        email: principal.type === "widget" ? principal.email : null,
        expiresAt,
        id: ulid().toLowerCase(),
        name: principal.type === "widget" ? principal.name : null,
        organizationId:
          principal.type === "private" || principal.type === "widget"
            ? principal.organizationId
            : null,
        principalType: principal.type,
        tokenHash: hashToken(token),
        userId: principal.type === "widget" ? principal.userId : null,
      });

      return { expiresAt: expiresAt.toISOString(), token };
    },
  };
};

export const connectionTokens = createConnectionTokens(databaseTokenStore);
