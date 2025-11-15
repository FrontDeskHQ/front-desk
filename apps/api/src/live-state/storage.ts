import { SQLStorage } from "@live-state/sync/server";
import { Pool } from "pg";

export const storage = new SQLStorage(
  new Pool({
    connectionString: process.env.DATABASE_URL,
  })
);
