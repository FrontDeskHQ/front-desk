import type { ThreadRead } from "@workspace/schemas/signals";
import { createScorer } from "evalite";
import type { SynthesisEvalCase } from "./dataset";

type In = SynthesisEvalCase["input"];
type Expected = SynthesisEvalCase["expected"];

export const nullityAlignment = createScorer<In, ThreadRead | null, Expected>({
  name: "Nullity Alignment",
  description: "Checks whether normalization returns null when expected.",
  scorer: ({ output, expected }) => {
    const expectedNull = expected?.shouldBeNull ?? false;
    const actualNull = output === null;
    return {
      score: expectedNull === actualNull ? 1 : 0,
      metadata: { expectedNull, actualNull },
    };
  },
});

export const primaryKindsAlignment = createScorer<In, ThreadRead | null, Expected>(
  {
    name: "Primary Kinds Alignment",
    description:
      "Checks that normalized primary action kinds match the expected sequence.",
    scorer: ({ output, expected }) => {
      const expectedKinds = expected?.primaryKinds ?? [];
      const actualKinds = output ? output.primary.map((action) => action.kind) : [];
      const score =
        actualKinds.length === expectedKinds.length &&
        actualKinds.every((kind, index) => kind === expectedKinds[index])
          ? 1
          : 0;
      return {
        score,
        metadata: { expectedKinds, actualKinds },
      };
    },
  },
);

export const sourceInputMessageSelection = createScorer<
  In,
  ThreadRead | null,
  Expected
>({
  name: "Source Input Message Selection",
  description:
    "Verifies sourceInputMessageId is preserved when valid and falls back when invalid.",
  scorer: ({ output, expected }) => {
    const expectedSource = expected?.sourceInputMessageId ?? null;
    const actualSource = output?.sourceInputMessageId ?? null;
    return {
      score: expectedSource === actualSource ? 1 : 0,
      metadata: { expectedSource, actualSource },
    };
  },
});

export const alternativesKindsAlignment = createScorer<
  In,
  ThreadRead | null,
  Expected
>({
  name: "Alternatives Kinds Alignment",
  description:
    "Checks that normalized alternatives action kinds match the expected sequence.",
  scorer: ({ output, expected }) => {
    const expectedKinds = expected?.alternativesKinds ?? [];
    const actualKinds = output?.alternatives?.map((action) => action.kind) ?? [];
    const score =
      actualKinds.length === expectedKinds.length &&
      actualKinds.every((kind, index) => kind === expectedKinds[index])
        ? 1
        : 0;
    return {
      score,
      metadata: { expectedKinds, actualKinds },
    };
  },
});
