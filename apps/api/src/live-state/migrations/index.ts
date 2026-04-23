import { createServerDB, type Storage } from "@live-state/sync/server";
import { schema } from "../schema";
import { migrations } from "./files";

export async function runMigrations(storage: Storage) {
  const db = createServerDB(storage, schema);
  const appliedRows = await db.migration.where({}).get();
  const applied = new Set(appliedRows.map((m) => m.id));

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    console.log(`[migrations] running ${m.name}`);
    await db.transaction(async ({ trx }) => {
      await m.up({ db: trx });
      await trx.migration.insert({ id: m.name, appliedAt: new Date() });
    });
    console.log(`[migrations] applied ${m.name}`);
  }
}
