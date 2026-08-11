import type { TurnSummary } from "./types";

export const collectRetryableProcessorFailures = (
  turns: TurnSummary[]
): string[] => {
  const failures: string[] = [];

  for (const turn of turns) {
    for (const { processor, threadResults } of turn.results) {
      for (const threadResult of threadResults) {
        if (!threadResult.success && threadResult.retryable) {
          failures.push(
            `${processor} (${threadResult.threadId}): ${threadResult.error}`
          );
        }
      }
    }
  }

  return failures;
};

export class RetryablePipelineError extends Error {
  constructor(failures: string[]) {
    super(`Retryable processor failure: ${failures.join("; ")}`);
    this.name = "RetryablePipelineError";
  }
}
