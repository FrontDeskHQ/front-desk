import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import { findDuplicateCandidate } from "../find";
import { duplicateDataset } from "./dataset";
import { duplicateMatchAccuracy, thresholdCalibration } from "./scorers";

evalite("Duplicate Generator", {
  data: () =>
    duplicateDataset.map((c) => ({
      input: c.input,
      expected: c.expected,
    })),
  task: async (input) => {
    const start = Date.now();
    const result = findDuplicateCandidate(input.results, {
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
  scorers: [duplicateMatchAccuracy, thresholdCalibration],
});
