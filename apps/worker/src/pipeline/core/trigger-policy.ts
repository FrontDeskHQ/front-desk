import type { ThreadReadTrigger } from "@workspace/schemas/signals";

/**
 * A supersede cause clears the existing read through its own path. Every other
 * explicit cause is an input to synthesis and must bypass dependency-only
 * skipping so its trigger context reaches the agent.
 */
export const hasSynthesisTrigger = (
  triggers: readonly ThreadReadTrigger[] | undefined
): boolean =>
  triggers?.some((trigger) => trigger.kind !== "supersede") ?? false;
