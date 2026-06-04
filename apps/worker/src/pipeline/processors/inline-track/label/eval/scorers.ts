import { createScorer } from "evalite";
import type { ClassifyLabelResult } from "../classify";
import type { LabelClassifierTestCase } from "./dataset";

type In = LabelClassifierTestCase["input"];

// 1 if the predicted label exactly matches expectedLabel (null included).
export const labelExactMatch = createScorer<
  In,
  ClassifyLabelResult,
  Pick<LabelClassifierTestCase, "expectedLabel">
>({
  name: "Label Exact Match",
  description: "Predicted labelId equals the expected one (null counts).",
  scorer: ({ output, expected }) => {
    const expectedLabel = expected?.expectedLabel ?? null;
    const score = output.labelId === expectedLabel ? 1 : 0;
    return {
      score,
      metadata: { predicted: output.labelId, expected: expectedLabel },
    };
  },
});

// Penalize high-confidence emissions when the expected bucket is "none".
// These are the costly errors — a wrong auto-apply.
//   bucket "none":  1 if labelId === null, else 1 - confidence (lower is worse)
//   bucket "low":   1 if confidence <= 0.6, else linearly decay
//   bucket "high":  1 if confidence >= 0.6 and labelId !== null, else 0
export const confidenceCalibration = createScorer<
  In,
  ClassifyLabelResult,
  Pick<LabelClassifierTestCase, "expectedConfidenceBucket" | "expectedLabel">
>({
  name: "Confidence Calibration",
  description: "Confidence is well-calibrated against the expected bucket.",
  scorer: ({ output, expected }) => {
    if (!expected) return { score: 0 };
    const { expectedConfidenceBucket } = expected;

    let score: number;
    if (expectedConfidenceBucket === "none") {
      score = output.labelId === null ? 1 : Math.max(0, 1 - output.confidence);
    } else if (expectedConfidenceBucket === "low") {
      score = output.confidence <= 0.6 ? 1 : Math.max(0, 1 - (output.confidence - 0.6) / 0.4);
    } else {
      score =
        output.labelId !== null && output.confidence >= 0.6
          ? 1
          : output.confidence;
    }

    return {
      score,
      metadata: {
        bucket: expectedConfidenceBucket,
        predicted: output.labelId,
        confidence: output.confidence,
      },
    };
  },
});
