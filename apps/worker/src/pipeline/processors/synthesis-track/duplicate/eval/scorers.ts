import { createScorer } from "evalite";
import type { DuplicateCandidate } from "../find";
import type { DuplicateTestCase } from "./dataset";

type In = DuplicateTestCase["input"];
type Expected = DuplicateTestCase["expected"];

export const duplicateMatchAccuracy = createScorer<
  In,
  DuplicateCandidate,
  Expected
>({
  name: "Duplicate Match Accuracy",
  description: "Picked targetThreadId matches expected (null counts).",
  scorer: ({ output, expected }) => {
    const expectedId = expected?.expectedCandidateThreadId ?? null;
    const actualId = output?.targetThreadId ?? null;
    const score = actualId === expectedId ? 1 : 0;
    return {
      score,
      metadata: { predicted: actualId, expected: expectedId },
    };
  },
});

// False positives (emitting when expected is null) are worse than misses —
// wrongly marking a thread as duplicate hides it. Only penalize FPs here.
export const thresholdCalibration = createScorer<
  In,
  DuplicateCandidate,
  Expected
>({
  name: "Threshold Calibration",
  description: "Penalize emissions when expected is null (false positives).",
  scorer: ({ output, expected }) => {
    const expectedId = expected?.expectedCandidateThreadId ?? null;
    if (expectedId === null && output !== null) {
      return {
        score: 0,
        metadata: { kind: "false_positive", predicted: output.targetThreadId },
      };
    }
    return { score: 1, metadata: { kind: "ok" } };
  },
});
