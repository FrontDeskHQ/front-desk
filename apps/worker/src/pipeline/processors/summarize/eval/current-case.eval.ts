import { createScorer, evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import type { Thread } from "../../../../types";
import type { ParsedSummary } from "../../../../types";
import { summarizeThread } from "../../summarize";

interface CurrentCaseInput {
  name: string;
  messages: {
    id: string;
    authorId: string;
    role: "customer" | "teammate";
    content: string;
    createdAt: string;
  }[];
}

interface CurrentCaseExpected {
  expectedActionTerms: string[];
  descriptionTerms: string[];
  forbiddenActionTerms?: string[];
}

const currentCaseAlignment = createScorer<
  CurrentCaseInput,
  ParsedSummary,
  CurrentCaseExpected
>({
  name: "Current Case Alignment",
  description:
    "The summary reflects the latest material customer outcome without over-escalating vague follow-ups.",
  scorer: ({ output, expected }) => {
    if (!expected) return { score: 0 };
    const action = output.expectedAction.toLowerCase();
    const description =
      `${output.title} ${output.shortDescription}`.toLowerCase();
    const actionMatched = expected.expectedActionTerms.some((term) =>
      action.includes(term.toLowerCase())
    );
    const descriptionMatched = expected.descriptionTerms.every((term) =>
      description.includes(term.toLowerCase())
    );
    const forbiddenMatched = (expected.forbiddenActionTerms ?? []).some(
      (term) => action.includes(term.toLowerCase())
    );

    return {
      score: actionMatched && descriptionMatched && !forbiddenMatched ? 1 : 0,
      metadata: {
        action: output.expectedAction,
        actionMatched,
        descriptionMatched,
        forbiddenMatched,
        title: output.title,
      },
    };
  },
});

const now = new Date().toISOString();

const cases: {
  input: CurrentCaseInput;
  expected: CurrentCaseExpected;
}[] = [
  {
    input: {
      name: "Widget fails after API key rotation",
      messages: [
        {
          id: "sum1m1",
          authorId: "customer1",
          role: "customer",
          createdAt: now,
          content:
            "We rotated our API key this morning and now the widget won't load.",
        },
        {
          id: "sum1m2",
          authorId: "teammate1",
          role: "teammate",
          createdAt: now,
          content:
            "Update the publicKey in the widget client, then rebuild and redeploy the application.",
        },
        {
          id: "sum1m3",
          authorId: "customer1",
          role: "customer",
          createdAt: now,
          content: "I tried those steps, but it is still not working.",
        },
        {
          id: "sum1m4",
          authorId: "customer1",
          role: "customer",
          createdAt: now,
          content: 'It is giving me this error: "Internal server error".',
        },
      ],
    },
    expected: {
      expectedActionTerms: ["engineering", "bug", "defect", "investigation"],
      descriptionTerms: ["internal server error", "widget"],
    },
  },
  {
    input: {
      name: "Widget fails after API key rotation",
      messages: [
        {
          id: "sum2m1",
          authorId: "customer2",
          role: "customer",
          createdAt: now,
          content:
            "We rotated our API key this morning and now the widget won't load.",
        },
        {
          id: "sum2m2",
          authorId: "teammate1",
          role: "teammate",
          createdAt: now,
          content:
            "Update the publicKey in the widget client, then rebuild and redeploy the application.",
        },
        {
          id: "sum2m3",
          authorId: "customer2",
          role: "customer",
          createdAt: now,
          content: "I tried that, but it still isn't working.",
        },
      ],
    },
    expected: {
      expectedActionTerms: [
        "configuration",
        "troubleshooting",
        "clarification",
      ],
      descriptionTerms: ["widget"],
      forbiddenActionTerms: ["engineering", "bug", "defect"],
    },
  },
];

evalite("Summarize — Current Case", {
  data: () => cases,
  scorers: [currentCaseAlignment],
  task: async (input) => {
    const start = Date.now();
    const customer = input.messages.find(
      (message) => message.role === "customer"
    );
    const thread = {
      authorId: customer?.authorId ?? "",
      id: `eval-${input.messages[0]?.id ?? "thread"}`,
      name: input.name,
      labels: [],
      messages: input.messages,
    } as unknown as Thread;
    const result = await summarizeThread(thread);

    reportTrace({
      start,
      end: Date.now(),
      input: [{ role: "user", content: JSON.stringify(input, null, 2) }],
      output: JSON.stringify(result),
    });
    return result;
  },
});
