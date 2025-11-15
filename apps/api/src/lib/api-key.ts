import { createKeys } from "keypal";
import { KyselyStore } from "keypal/kysely";
import process from "node:process";
import { Pool } from "pg";
import { storage } from "../live-state/storage";

// TODO - FRO-105: Move this to live-state schema

const initializeApiKeysTable = async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  console.log("Initializing API keys table...");

  try {
    // Create table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public_api_keys (
        id TEXT PRIMARY KEY,
        key_hash TEXT UNIQUE NOT NULL,
        metadata JSONB NOT NULL
      )
    `);

    // Create index if it doesn't exist
    await pool.query(`
      CREATE INDEX IF NOT EXISTS public_api_keys_key_hash_idx ON public_api_keys(key_hash)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_api_keys (
        id TEXT PRIMARY KEY,
        key_hash TEXT UNIQUE NOT NULL,
        metadata JSONB NOT NULL
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS private_api_keys_key_hash_idx ON private_api_keys(key_hash)
    `);
  } finally {
    await pool.end();
  }
};

// Initialize the table when the module is loaded
initializeApiKeysTable().catch((error) => {
  console.error("Failed to initialize API keys tables:", error);
});

export const publicKeys = createKeys({
  prefix: "fd_pk_",
  storage: new KyselyStore({
    db: storage.internalDB as any,
    table: "public_api_keys",
    schema: {
      apiKeyColumns: {
        keyHash: "key_hash",
      },
    },
  }),
  cache: true,
  autoTrackUsage: true,
});

if (
  (process.env.NODE_ENV ?? "development") !== "development" &&
  !process.env.API_KEY_SALT
) {
  throw new Error("API_KEY_SALT is not set");
}

export const privateKeys = createKeys({
  prefix: "fd_sk_",
  storage: new KyselyStore({
    db: storage.internalDB as any,
    table: "private_api_keys",
  }),
  cache: true,
  autoTrackUsage: true,
  salt: process.env.API_KEY_SALT,
});
