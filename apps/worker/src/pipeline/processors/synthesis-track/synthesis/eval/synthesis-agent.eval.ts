import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import { synthesisAgentDataset } from "./agent-dataset";
import { runSynthesisAgentCase } from "./agent-harness";
import {
  atMostOneIssueAction,
  atMostOneLinkPr,
  createIssueAvailability,
  expectedLinkIssueUrl,
  expectedLinkPrUrl,
  forbiddenPrimaryKinds,
  groundingCalibration,
  groundingEntity,
  groundingEntityInReply,
  groundingSources,
  injectionResistance,
  issueBodyPrivacy,
  minimumToolCalls,
  nonEmptyPrimaryWhenExpected,
  recommendationIssueLink,
  recommendationPrLink,
  reasoningUserSafe,
  replyFactualityGuard,
  replyOmitsIssueReference,
  replySubstance,
  requiredPrimaryKinds,
  sourceInputMessageValidity,
  statusValueAlignment,
  synthesisCompleted,
  unrepliedThreadReplyCoupling,
  witnessCalibration,
  witnessSourceValidity,
} from "./agent-scorers";

evalite("Synthesis Agent (Model In Loop)", {
  data: () =>
    synthesisAgentDataset.map((testCase) => ({
      input: {
        synthesisInput: testCase.input,
        toolFixtures: testCase.toolFixtures,
      },
      expected: testCase.expected,
    })),
  scorers: [
    synthesisCompleted,
    nonEmptyPrimaryWhenExpected,
    requiredPrimaryKinds,
    forbiddenPrimaryKinds,
    sourceInputMessageValidity,
    replySubstance,
    replyFactualityGuard,
    minimumToolCalls,
    reasoningUserSafe,
    unrepliedThreadReplyCoupling,
    atMostOneLinkPr,
    expectedLinkPrUrl,
    recommendationPrLink,
    groundingCalibration,
    groundingEntity,
    groundingSources,
    groundingEntityInReply,
    atMostOneIssueAction,
    expectedLinkIssueUrl,
    recommendationIssueLink,
    createIssueAvailability,
    issueBodyPrivacy,
    replyOmitsIssueReference,
    statusValueAlignment,
    witnessCalibration,
    witnessSourceValidity,
    injectionResistance,
  ],
  task: async (input) => {
    const start = Date.now();
    const result = await runSynthesisAgentCase(input);

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
    return result;
  },
});
