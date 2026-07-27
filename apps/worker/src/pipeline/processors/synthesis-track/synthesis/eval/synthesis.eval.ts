import type { ThreadRead } from "@workspace/schemas/signals";
import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import { normalizeSynthesisRawActionSet } from "../normalize";
import { synthesisDataset } from "./dataset";
import {
  alternativesKindsAlignment,
  nullityAlignment,
  primaryKindsAlignment,
  sourceInputMessageSelection,
} from "./scorers";

evalite("Synthesis Normalize", {
  data: () =>
    synthesisDataset.map((testCase) => ({
      input: testCase.input,
      expected: testCase.expected,
    })),
  scorers: [
    nullityAlignment,
    primaryKindsAlignment,
    alternativesKindsAlignment,
    sourceInputMessageSelection,
  ],
  task: async (input) => {
    const start = Date.now();
    const result = normalizeSynthesisRawActionSet({
      output: input.output,
      messageIds: new Set(input.messageIds),
      fallbackSourceInputMessageId: input.fallbackSourceInputMessageId,
      hasTeamReply: input.hasTeamReply,
      verifiedPrUrls: input.verifiedPrUrls
        ? new Set(input.verifiedPrUrls)
        : undefined,
    });
    reportTrace({
      start,
      end: Date.now(),
      input: [
        {
          role: "user",
          content: JSON.stringify(input, null, 2),
        },
      ],
      output: JSON.stringify(result),
    });
    return result as ThreadRead | null;
  },
});
