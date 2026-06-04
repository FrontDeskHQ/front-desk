import type { DuplicateEvidence } from "@workspace/schemas/signals";
import { createScorer } from "evalite";
import type { DuplicateTestCase } from "./dataset";

type In = DuplicateTestCase["input"];
type Expected = DuplicateTestCase["expected"];

export const duplicateEvidenceRetrieval = createScorer<
  In,
  DuplicateEvidence | null,
  Expected
>({
  name: "Duplicate Evidence Retrieval",
  description:
    "Evidence threadId matches the expected related thread (null counts).",
  scorer: ({ output, expected }) => {
    const expectedId = expected?.expectedThreadId ?? null;
    const actualId = output?.threadId ?? null;
    const score = actualId === expectedId ? 1 : 0;
    return {
      score,
      metadata: { predicted: actualId, expected: expectedId },
    };
  },
});

export const duplicateEvidenceScore = createScorer<
  In,
  DuplicateEvidence | null,
  Expected
>({
  name: "Duplicate Evidence Score",
  description:
    "When evidence is emitted, score meets threshold and matches the winning hit.",
  scorer: ({ input, output, expected }) => {
    const expectedId = expected?.expectedThreadId ?? null;
    if (expectedId === null) {
      return { score: 1, metadata: { kind: "no_evidence_expected" } };
    }
    if (!output) {
      return { score: 0, metadata: { kind: "missing_evidence" } };
    }
    const hit = input.results.find((r) => r.threadId === output.threadId);
    const scoreOk =
      output.score >= input.threshold &&
      hit !== undefined &&
      output.score === hit.score;
    return {
      score: scoreOk ? 1 : 0,
      metadata: {
        evidenceScore: output.score,
        hitScore: hit?.score,
        threshold: input.threshold,
      },
    };
  },
});

// False positives (emitting when expected is null) are worse than misses —
// surfacing a wrong duplicate lead pollutes synthesis. Only penalize FPs here.
export const thresholdCalibration = createScorer<
  In,
  DuplicateEvidence | null,
  Expected
>({
  name: "Threshold Calibration",
  description: "Penalize evidence when expected is null (false positives).",
  scorer: ({ output, expected }) => {
    const expectedId = expected?.expectedThreadId ?? null;
    if (expectedId === null && output !== null) {
      return {
        score: 0,
        metadata: { kind: "false_positive", predicted: output.threadId },
      };
    }
    return { score: 1, metadata: { kind: "ok" } };
  },
});
