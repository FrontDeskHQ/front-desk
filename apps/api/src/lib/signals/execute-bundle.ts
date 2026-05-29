import {
  type Action,
  isReversible,
} from "@workspace/schemas/signals";
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

  return { reversibles, nonReversibles };
};

const runSequential = async (
  actions: Action[],
  registry: ActionHandlerRegistry,
  ctx: ExecutionContext,
  phase: "reversible" | "non-reversible",
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
        for (const applied of [...appliedReversibles].reverse()) {
          const rollbackHandler = registry[applied.kind];
          if (rollbackHandler.compensate) {
            try {
              await rollbackHandler.compensate(applied, ctx);
              rolledBack.push(applied);
            } catch (compensateError) {
              console.error(
                `Compensation failed for ${applied.kind} on thread ${ctx.threadId}:`,
                compensateError,
              );
            }
          }
        }
        return {
          succeeded: [],
          failed: { action, error },
          rolledBack,
        };
      }

      return {
        succeeded,
        failed: { action, error },
        rolledBack: [],
      };
    }
  }

  return {
    succeeded,
    failed: null,
    rolledBack: [],
  };
};

export const executeBundle = async (
  bundle: Action[],
  registry: ActionHandlerRegistry,
  ctx: ExecutionContext,
): Promise<ExecutionResult> => {
  if (bundle.length === 0) {
    return { succeeded: [], failed: null, rolledBack: [] };
  }

  const { reversibles, nonReversibles } = partitionBundle(bundle);

  const reversibleResult = await runSequential(
    reversibles,
    registry,
    ctx,
    "reversible",
  );
  if (reversibleResult.failed) {
    return reversibleResult;
  }

  const nonReversibleResult = await runSequential(
    nonReversibles,
    registry,
    ctx,
    "non-reversible",
  );

  return {
    succeeded: [
      ...reversibleResult.succeeded,
      ...nonReversibleResult.succeeded,
    ],
    failed: nonReversibleResult.failed,
    rolledBack: nonReversibleResult.rolledBack,
  };
};
