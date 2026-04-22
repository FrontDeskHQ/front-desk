import type { ServerDB } from "@live-state/sync/server";
import type { schema } from "../schema";

export type MigrationDB = ServerDB<typeof schema>;

export type Migration = {
  name: string;
  up: (opts: { db: MigrationDB }) => Promise<void>;
};
