import type { RelatedDocEvidenceItem } from "@workspace/schemas/signals";
import { createScorer } from "evalite";

import type { RelatedDocsTestCase } from "./dataset";

type In = RelatedDocsTestCase["input"];
type Expected = RelatedDocsTestCase["expected"];

export const relatedDocsRanking = createScorer<
  In,
  RelatedDocEvidenceItem[],
  Expected
>({
  description: "Ordered docIds match expected relevance ranking.",
  name: "Related Docs Ranking",
  scorer: ({ output, expected }) => {
    const expectedDocIds = expected?.docIds ?? [];
    const actual = output.map((doc) => doc.docId);
    const score =
      actual.length === expectedDocIds.length &&
      actual.every((id, index) => id === expectedDocIds[index])
        ? 1
        : 0;
    return {
      score,
      metadata: { actual, expected: expectedDocIds },
    };
  },
});
