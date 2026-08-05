import type { ThreadReadTrigger } from "@workspace/schemas/signals";

/** Supersede clears an existing read and never enters synthesis. */
export const hasSynthesisTrigger = (
  triggers: readonly ThreadReadTrigger[] | undefined
): boolean =>
  triggers?.some((trigger) => trigger.kind !== "supersede") ?? false;
