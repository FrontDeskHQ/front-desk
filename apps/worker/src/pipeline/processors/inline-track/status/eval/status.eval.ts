import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import { inferStatus } from "../infer";
import { statusInfererDataset } from "./dataset";
import {
  confidenceCalibration,
  noSpuriousEmission,
  statusExactMatch,
} from "./scorers";

evalite("Status Inferer", {
  data: () =>
    statusInfererDataset.map((c) => ({
      input: c.input,
      expected: {
        expectedStatus: c.expectedStatus,
        expectedConfidenceBucket: c.expectedConfidenceBucket,
      },
    })),
  scorers: [statusExactMatch, noSpuriousEmission, confidenceCalibration],
  task: async (input) => {
    const start = Date.now();
    const result = await inferStatus(input);
    const transcript = input.recentMessages
      .map((m, i) => `${i + 1}. [${m.role}] ${m.content}`)
      .join("\n");
    reportTrace({
      start,
      end: Date.now(),
      input: [
        {
          role: "user",
          content: `Title: ${input.threadName ?? "(none)"}\nCurrent status: ${input.currentStatus}\nMessages:\n${transcript}`,
        },
      ],
      output: JSON.stringify(result),
    });
    return result;
  },
});
