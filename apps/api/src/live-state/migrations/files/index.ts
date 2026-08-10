import type { Migration } from "../types";
import m001 from "./001_backfill_thread_short_id";
import m002 from "./002_seed_autonomy_settings";
import m003 from "./003_backfill_subscription_plan_to_settings";
import m004 from "./004_drop_close_autonomy";

export const migrations: Migration[] = [m001, m002, m003, m004];
