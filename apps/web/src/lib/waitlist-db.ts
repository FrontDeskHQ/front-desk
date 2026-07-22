// TODO remove this file and uninstall all the packages related to it
import { Kysely } from "kysely";
import type { Generated } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

interface WaitlistTable {
  id: Generated<number>;
  created_at: Generated<Date>;
  email: string;
}

interface DB {
  waitlist: WaitlistTable;
}

let waitlistDbInstance: Kysely<DB> | null = null;

export async function getWaitlistDbInstance(): Promise<Kysely<DB>> {
  if (waitlistDbInstance) {
    return waitlistDbInstance;
  }

  const pg = postgres({
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    max: 10,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
  });
  /**
   * The following line is to check if the connection is successful.
   */
  await pg.unsafe("SELECT 1");

  waitlistDbInstance = new Kysely<DB>({
    dialect: new PostgresJSDialect({
      postgres: pg,
    }),
  });

  return waitlistDbInstance;
}

/** @deprecated Use getWaitlistDbInstance instead. */
export const WorkerDb = {
  getInstance: getWaitlistDbInstance,
};
