import { isReversible } from "@workspace/schemas/signals";
import type { Action } from "@workspace/schemas/signals";

import type {
  ActionHandlerRegistry,
  ExecutionContext,
  ExecutionResult,
} from "./types";

const partitionBundle = (bundle: Action[]) => {
  const reversibles: Action[] = [];
  const nonReversibles: Action[] = [];

  for (const action of bundle) {
    if (isReversible(action)) {
      reversibles.push(action);
    } else {
      nonReversibles.push(action);
    }
  }

  return { nonReversibles, reversibles };
};

const runSequential = async (
  actions: Action[],
  registry: ActionHandlerRegistry,
  ctx: ExecutionContext,
  phase: "reversible" | "non-reversible"
): Promise<ExecutionResult> => {
  const succeeded: Action[] = [];
  const appliedReversibles: Action[] = [];

  for (const action of actions) {
    const handler = registry[action.kind];
    try {
      await handler.apply(action, ctx);
      succeeded.push(action);
      if (phase === "reversible") {
        appliedReversibles.push(action);
      }
    } catch (error) {
      if (phase === "reversible") {
        const rolledBack: Action[] = [];
        for (const applied of [...appliedReversibles].toReversed()) {
          const rollbackHandler = registry[applied.kind];
          if (rollbackHandler.compensate) {
            try {
              await rollbackHandler.compensate(applied, ctx);
              rolledBack.push(applied);
            } catch (compensateError) {
              console.error(
                `Compensation failed for ${applied.kind} on thread ${ctx.threadId}:`,
                compensateError
              );
            }
          }
        }
        // Reversibles that were applied but not rolled back (compensation
        // failed, or no compensator exists) still took effect, so report them
        // as succeeded — otherwise the retry read keeps them and replays their
        // side effects.
        const stillApplied = appliedReversibles.filter(
          (applied) => !rolledBack.includes(applied)
        );
        return {
          failed: { action, error },
          rolledBack,
          succeeded: stillApplied,
        };
      }

      return {
        failed: { action, error },
        rolledBack: [],
        succeeded,
      };
    }
  }

  return {
    failed: null,
    rolledBack: [],
    succeeded,
  };
};

/**
 * Validates bundle-wide preconditions before any side effect runs, so a partial
 * failure mid-bundle can't leave a compound read half-applied (e.g. a paired
 * close/duplicate persisting without the reply it was coupled with).
 */
const assertBundleApplicable = (bundle: Action[]): void => {
  for (const action of bundle) {
    if (action.kind === "reply" && action.draftMarkdown.trim().length === 0) {
      throw new Error("REPLY_DRAFT_EMPTY");
    }
  }
};

export const executeBundle = async (
  bundle: Action[],
  registry: ActionHandlerRegistry,
  ctx: ExecutionContext
): Promise<ExecutionResult> => {
  if (bundle.length === 0) {
    return { failed: null, rolledBack: [], succeeded: [] };
  }

  assertBundleApplicable(bundle);

  const { reversibles, nonReversibles } = partitionBundle(bundle);

  const reversibleResult = await runSequential(
    reversibles,
    registry,
    ctx,
    "reversible"
  );
  if (reversibleResult.failed) {
    return reversibleResult;
  }

  const nonReversibleResult = await runSequential(
    nonReversibles,
    registry,
    ctx,
    "non-reversible"
  );

  return {
    failed: nonReversibleResult.failed,
    rolledBack: nonReversibleResult.rolledBack,
    succeeded: [
      ...reversibleResult.succeeded,
      ...nonReversibleResult.succeeded,
    ],
  };
};
