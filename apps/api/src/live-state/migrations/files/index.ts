import type { Migration } from "../types";
import m001 from "./001_backfill_thread_short_id";

export const migrations: Migration[] = [m001];
