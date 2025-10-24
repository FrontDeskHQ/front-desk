// TODO remove this file and uninstall all the packages related to it
import { type Generated, Kysely } from "kysely";
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

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class WorkerDb {
  private static instance: Kysely<DB> | null = null;

  static async getInstance(): Promise<Kysely<DB>> {
    const pg = postgres({
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT),
      max: 10,
    });
    /**
     * The following line is to check if the connection is successful.
     */
    await pg.unsafe("SELECT 1");

    this.instance = new Kysely<DB>({
      dialect: new PostgresJSDialect({
        postgres: pg,
      }),
    });

    return this.instance;
  }
}
