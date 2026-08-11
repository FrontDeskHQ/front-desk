import { describe, expect, it } from "vitest";

import { collectRetryableProcessorFailures } from "./retry";

describe(collectRetryableProcessorFailures, () => {
  it("returns retryable processor failures and ignores permanent failures", () => {
    const failures = collectRetryableProcessorFailures([
      {
        duration: 10,
        processors: ["synthesis"],
        results: [
          {
            processor: "synthesis",
            threadResults: [
              {
                error: "Synthesis output parsing failed",
                retryable: true,
                success: false,
                threadId: "thread-1",
              },
              {
                error: "invalid thread",
                retryable: false,
                success: false,
                threadId: "thread-2",
              },
            ],
          },
        ],
        turnNumber: 1,
      },
    ]);

    expect(failures).toEqual([
      "synthesis (thread-1): Synthesis output parsing failed",
    ]);
  });
});
