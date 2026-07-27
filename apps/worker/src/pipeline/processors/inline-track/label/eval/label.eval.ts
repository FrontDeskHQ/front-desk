import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import { classifyLabel } from "../classify";
import { labelClassifierDataset } from "./dataset";
import { confidenceCalibration, labelExactMatch } from "./scorers";

evalite("Label Classifier", {
  data: () =>
    labelClassifierDataset.map((c) => ({
      input: c.input,
      expected: {
        expectedLabel: c.expectedLabel,
        expectedConfidenceBucket: c.expectedConfidenceBucket,
      },
    })),
  scorers: [labelExactMatch, confidenceCalibration],
  task: async (input) => {
    const start = Date.now();
    const result = await classifyLabel(input);
    reportTrace({
      start,
      end: Date.now(),
      input: [
        {
          role: "user",
          content: `Title: ${input.threadName ?? "(none)"}\nFirst message: ${input.firstMessageContent ?? "(none)"}\nLabels: ${input.orgLabels.map((l) => l.name).join(", ")}`,
        },
      ],
      output: JSON.stringify(result),
    });
    return result;
  },
});
