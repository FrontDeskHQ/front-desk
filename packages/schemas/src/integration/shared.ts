import { z } from "zod";

import type { OrganizationSettings } from "../organization";

/**
 * Progress of a support integration's "Import threads" run, stored on
 * `integration.threadImport`. `null` means no import has run yet.
 *
 * `done` is the only terminal state. Its counts describe the latest run; the
 * UI derives "Partial result", "No eligible threads found" and "Allowance
 * exhausted" from them. It deliberately has no "synced" meaning: a finished
 * import says nothing about whether FrontDesk has read the threads yet.
 */
export const threadImportStatusSchema = z.discriminatedUnion("state", [
  z.object({
    startedAt: z.string(),
    state: z.literal("finding"),
  }),
  z.object({
    failed: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    startedAt: z.string(),
    state: z.literal("importing"),
    /** Most threads this run can import: the remaining allowance, or `null`
     * when the plan is unlimited and the run goes until history runs out. */
    total: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    /** The allowance ran out before every eligible thread was imported. */
    exhausted: z.boolean(),
    failed: z.number().int().nonnegative(),
    finishedAt: z.string(),
    imported: z.number().int().nonnegative(),
    startedAt: z.string(),
    state: z.literal("done"),
  }),
]);

export type ThreadImportStatus = z.infer<typeof threadImportStatusSchema>;

/**
 * Cumulative number of historical threads an organization may import, per
 * plan. `null` is unlimited. Pricing owns the real numbers; these keep the
 * previous backfill cap until it does.
 */
const THREAD_IMPORT_ALLOWANCE: Record<
  OrganizationSettings["plan"],
  number | null
> = {
  "beta-feedback": 100,
  pro: null,
  starter: 100,
  trial: 100,
};

export const threadImportAllowance = (
  plan: OrganizationSettings["plan"] | undefined
): number | null => THREAD_IMPORT_ALLOWANCE[plan ?? "trial"];
