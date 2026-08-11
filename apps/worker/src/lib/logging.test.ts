import { describe, expect, it } from "vitest";

import { SynthesisOutputParseError } from "../pipeline/processors/synthesis-track/synthesis/synthesize";
import { isRetryableError } from "./logging";

describe(isRetryableError, () => {
  it("treats synthesis output parsing failures as retryable", () => {
    const error = new SynthesisOutputParseError(new Error("invalid JSON"));

    expect(isRetryableError(error)).toBe(true);
  });
});
