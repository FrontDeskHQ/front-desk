import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import { pickDuplicateEvidence } from "../find";
import { duplicateDataset } from "./dataset";
import {
  duplicateEvidenceRetrieval,
  duplicateEvidenceScore,
  thresholdCalibration,
} from "./scorers";

evalite("Duplicate Hint", {
  data: () =>
    duplicateDataset.map((c) => ({
      input: c.input,
      expected: c.expected,
    })),
  scorers: [
    duplicateEvidenceRetrieval,
    duplicateEvidenceScore,
    thresholdCalibration,
  ],
  task: async (input) => {
    const start = Date.now();
    const result = pickDuplicateEvidence(input.results, {
      threshold: input.threshold,
    });
    reportTrace({
      start,
      end: Date.now(),
      input: [
        {
          role: "user",
          content: `threshold=${input.threshold}\nresults=${input.results
            .map((r) => `${r.threadId}@${r.score}`)
            .join(", ")}`,
        },
      ],
      output: JSON.stringify(result),
    });
    return result;
  },
});
