import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import { synthesisAgentDataset } from "./agent-dataset";
import { runSynthesisAgentCase } from "./agent-harness";
import {
  atMostOneIssueAction,
  forbiddenPrimaryKinds,
  minimumToolCalls,
  replyOmitsIssueReference,
  replySubstance,
  requiredPrimaryKinds,
  synthesisCompleted,
  targetedIssueSearch,
} from "./agent-scorers";

const escalationCases = synthesisAgentDataset.filter((testCase) =>
  testCase.name.startsWith("escalation:")
);

evalite("Synthesis Agent — Follow-up Escalation", {
  data: () =>
    escalationCases.map((testCase) => ({
      input: {
        synthesisInput: testCase.input,
        toolFixtures: testCase.toolFixtures,
      },
      expected: testCase.expected,
    })),
  scorers: [
    synthesisCompleted,
    requiredPrimaryKinds,
    forbiddenPrimaryKinds,
    minimumToolCalls,
    targetedIssueSearch,
    atMostOneIssueAction,
    replyOmitsIssueReference,
    replySubstance,
  ],
  task: async (input) => {
    const start = Date.now();
    const result = await runSynthesisAgentCase(input);

    reportTrace({
      start,
      end: Date.now(),
      input: [{ role: "user", content: JSON.stringify(input, null, 2) }],
      output: JSON.stringify(result),
    });
    return result;
  },
});
