import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import { relatedDocsHintSpec } from "../processor";
import { relatedDocsDataset } from "./dataset";
import { relatedDocsRanking } from "./scorers";

evalite("Related Docs Hint", {
  data: () =>
    relatedDocsDataset.map((c) => ({
      input: c.input,
      expected: c.expected,
    })),
  scorers: [relatedDocsRanking],
  task: async (input) => {
    const start = Date.now();
    const result =
      relatedDocsHintSpec.select(input.hits, {
        limit: input.limit ?? relatedDocsHintSpec.tuning.limit,
        scoreThreshold: relatedDocsHintSpec.tuning.scoreThreshold,
      })?.docs ?? [];
    reportTrace({
      start,
      end: Date.now(),
      input: [
        {
          role: "user",
          content: `hits=${input.hits
            .map((h) => `${h.payload.pageUrl}@${h.score}`)
            .join(", ")}`,
        },
      ],
      output: JSON.stringify(result),
    });
    return result;
  },
});
