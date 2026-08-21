import { createScorer, evalite } from "evalite";
import { reportTrace } from "evalite/traces";

import type { ParsedSummary, Thread } from "../../../../types";
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
  forbiddenDescriptionTerms?: string[];
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
    const forbiddenActionMatched = (expected.forbiddenActionTerms ?? []).some(
      (term) => action.includes(term.toLowerCase())
    );
    const forbiddenDescriptionMatched = (
      expected.forbiddenDescriptionTerms ?? []
    ).some((term) => description.includes(term.toLowerCase()));

    return {
      score:
        actionMatched &&
        descriptionMatched &&
        !forbiddenActionMatched &&
        !forbiddenDescriptionMatched
          ? 1
          : 0,
      metadata: {
        action: output.expectedAction,
        actionMatched,
        descriptionMatched,
        forbiddenActionMatched,
        forbiddenDescriptionMatched,
        title: output.title,
      },
    };
  },
});

const cases: {
  input: CurrentCaseInput;
  expected: CurrentCaseExpected;
}[] = [
  {
    input: {
      name: "Widget fails after API key rotation",
      messages: [
        {
          id: "sum1m4",
          authorId: "customer1",
          role: "customer",
          createdAt: "2026-08-21T12:03:00.000Z",
          content: 'It is giving me this error: "Internal server error".',
        },
        {
          id: "sum1m1",
          authorId: "customer1",
          role: "customer",
          createdAt: "2026-08-21T12:00:00.000Z",
          content:
            "We rotated our API key this morning and now the widget won't load.",
        },
        {
          id: "sum1m2",
          authorId: "teammate1",
          role: "teammate",
          createdAt: "2026-08-21T12:01:00.000Z",
          content:
            "Update the publicKey in the widget client, then rebuild and redeploy the application.",
        },
        {
          id: "sum1m3",
          authorId: "customer1",
          role: "customer",
          createdAt: "2026-08-21T12:02:00.000Z",
          content: "I tried those steps, but it is still not working.",
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
          id: "sum2m3",
          authorId: "customer2",
          role: "customer",
          createdAt: "2026-08-21T12:02:00.000Z",
          content: "I tried that, but it still isn't working.",
        },
        {
          id: "sum2m1",
          authorId: "customer2",
          role: "customer",
          createdAt: "2026-08-21T12:00:00.000Z",
          content:
            "We rotated our API key this morning and now the widget won't load.",
        },
        {
          id: "sum2m2",
          authorId: "teammate1",
          role: "teammate",
          createdAt: "2026-08-21T12:01:00.000Z",
          content:
            "Update the publicKey in the widget client, then rebuild and redeploy the application.",
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
      forbiddenActionTerms: ["engineering", "bug", "defect", "investigation"],
      forbiddenDescriptionTerms: ["internal server error"],
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
