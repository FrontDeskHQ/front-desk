import { createScorer } from "evalite";

import type { InferStatusResult } from "../infer";
import type { StatusInfererTestCase } from "./dataset";

type In = StatusInfererTestCase["input"];

// 1 if the predicted status exactly matches expectedStatus (null included).
export const statusExactMatch = createScorer<
  In,
  InferStatusResult,
  Pick<StatusInfererTestCase, "expectedStatus">
>({
  description: "Predicted status equals the expected one (null counts).",
  name: "Status Exact Match",
  scorer: ({ output, expected }) => {
    const expectedStatus = expected?.expectedStatus ?? null;
    const score = output.status === expectedStatus ? 1 : 0;
    return {
      score,
      metadata: { predicted: output.status, expected: expectedStatus },
    };
  },
});

// Penalize emitting a status change that matches the current status — the
// processor is meant to short-circuit on equality, so the model returning the
// current status with high confidence is a regression signal.
export const noSpuriousEmission = createScorer<
  In,
  InferStatusResult,
  Pick<StatusInfererTestCase, "expectedStatus">
>({
  description:
    "Penalize when the model returns the current status with non-trivial confidence.",
  name: "No Spurious Emission",
  scorer: ({ input, output }) => {
    if (output.status === null) return { score: 1 };
    if (output.status !== input.currentStatus) return { score: 1 };
    // Same as current → ideally the model should have returned null.
    return {
      score: Math.max(0, 1 - output.confidence),
      metadata: {
        currentStatus: input.currentStatus,
        predicted: output.status,
        confidence: output.confidence,
      },
    };
  },
});

// Penalize high-confidence emissions when the expected bucket is "none".
//   bucket "none":  1 if status === null, else 1 - confidence
//   bucket "low":   1 if confidence <= 0.6, else linearly decay
//   bucket "high":  1 if confidence >= 0.6 and status !== null, else confidence
export const confidenceCalibration = createScorer<
  In,
  InferStatusResult,
  Pick<StatusInfererTestCase, "expectedConfidenceBucket" | "expectedStatus">
>({
  description: "Confidence is well-calibrated against the expected bucket.",
  name: "Confidence Calibration",
  scorer: ({ output, expected }) => {
    if (!expected) return { score: 0 };
    const { expectedConfidenceBucket } = expected;

    let score: number;
    if (expectedConfidenceBucket === "none") {
      score = output.status === null ? 1 : Math.max(0, 1 - output.confidence);
    } else if (expectedConfidenceBucket === "low") {
      score =
        output.confidence <= 0.6
          ? 1
          : Math.max(0, 1 - (output.confidence - 0.6) / 0.4);
    } else {
      score =
        output.status !== null && output.confidence >= 0.6
          ? 1
          : output.confidence;
    }

    return {
      score,
      metadata: {
        bucket: expectedConfidenceBucket,
        predicted: output.status,
        confidence: output.confidence,
      },
    };
  },
});
