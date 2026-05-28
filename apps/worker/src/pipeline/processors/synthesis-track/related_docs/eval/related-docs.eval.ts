import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import { pickRelatedDocs } from "../find";
import { relatedDocsDataset } from "./dataset";
import { relatedDocsRanking } from "./scorers";

evalite("Related Docs Hint", {
  data: () =>
    relatedDocsDataset.map((c) => ({
      input: c.input,
      expected: c.expected,
    })),
  task: async (input) => {
    const start = Date.now();
    const result = pickRelatedDocs(input.hits, { limit: input.limit });
    reportTrace({
      start,
      end: Date.now(),
      input: [
        {
          role: "user",
          content: `hits=${input.hits
            .map((h) => `${h.pageUrl}@${h.score}`)
            .join(", ")}`,
        },
      ],
      output: JSON.stringify(result),
    });
    return result;
  },
  scorers: [relatedDocsRanking],
});
