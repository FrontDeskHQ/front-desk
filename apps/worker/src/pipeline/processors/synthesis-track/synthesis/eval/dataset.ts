import type { SynthesisRawActionSet } from "../synthesize";

export type SynthesisEvalCase = {
  name: string;
  input: {
    output: SynthesisRawActionSet;
    messageIds: string[];
    fallbackSourceInputMessageId: string;
    hasTeamReply: boolean;
  };
  expected: {
    shouldBeNull: boolean;
    primaryKinds: Array<"reply" | "mark_duplicate" | "close">;
    alternativesKinds: Array<"reply" | "mark_duplicate" | "close">;
    sourceInputMessageId: string | null;
  };
};

export const synthesisDataset: SynthesisEvalCase[] = [
  {
    name: "empty primary becomes null read",
    input: {
      output: {
        summary: "No action needed",
        reasoning: "No substantive move is justified.",
        primary: [],
        alternatives: [],
        urgencyScore: 10,
        sourceInputMessageId: "m2",
      },
      messageIds: ["m1", "m2"],
      fallbackSourceInputMessageId: "m2",
      hasTeamReply: true,
    },
    expected: {
      shouldBeNull: true,
      primaryKinds: [],
      alternativesKinds: [],
      sourceInputMessageId: null,
    },
  },
  {
    name: "reply draft is trimmed and source id is preserved when valid",
    input: {
      output: {
        summary: "Customer reports invoice amount mismatch ",
        reasoning:
          " Latest inbound asks why the invoice total differs from the expected plan price. ",
        primary: [
          {
            kind: "reply",
            draftMarkdown:
              "  Thanks for flagging this. I checked the invoice and the difference is from prorated usage after your mid-cycle plan change. If you want, I can break down each line item with dates so you can verify the total.  ",
          },
        ],
        alternatives: [],
        urgencyScore: 55,
        sourceInputMessageId: "m3",
      },
      messageIds: ["m1", "m2", "m3"],
      fallbackSourceInputMessageId: "m3",
      hasTeamReply: true,
    },
    expected: {
      shouldBeNull: false,
      primaryKinds: ["reply"],
      alternativesKinds: [],
      sourceInputMessageId: "m3",
    },
  },
  {
    name: "invalid source id falls back to latest known message id",
    input: {
      output: {
        summary: "Likely duplicate report",
        reasoning: "Hint points strongly to an existing thread.",
        primary: [{ kind: "mark_duplicate", targetThreadId: "t-123" }],
        alternatives: [{ kind: "close" }],
        urgencyScore: 72,
        sourceInputMessageId: "missing-message",
      },
      messageIds: ["m7", "m8"],
      fallbackSourceInputMessageId: "m8",
      hasTeamReply: true,
    },
    expected: {
      shouldBeNull: false,
      primaryKinds: ["mark_duplicate"],
      alternativesKinds: ["close"],
      sourceInputMessageId: "m8",
    },
  },
  {
    name: "blank reply draft is dropped and can null the read",
    input: {
      output: {
        summary: "No useful reply content",
        reasoning: "Model proposed an empty draft.",
        primary: [{ kind: "reply", draftMarkdown: "   " }],
        alternatives: [],
        urgencyScore: 20,
        sourceInputMessageId: "m1",
      },
      messageIds: ["m1"],
      fallbackSourceInputMessageId: "m1",
      hasTeamReply: true,
    },
    expected: {
      shouldBeNull: true,
      primaryKinds: [],
      alternativesKinds: [],
      sourceInputMessageId: null,
    },
  },
  {
    name: "blank duplicate target is dropped and falls back to null",
    input: {
      output: {
        summary: "Duplicate target is missing",
        reasoning: "Model attempted mark_duplicate without a real target id.",
        primary: [{ kind: "mark_duplicate", targetThreadId: "   " }],
        alternatives: [{ kind: "close" }],
        urgencyScore: 30,
        sourceInputMessageId: "m1",
      },
      messageIds: ["m1"],
      fallbackSourceInputMessageId: "m1",
      hasTeamReply: true,
    },
    expected: {
      shouldBeNull: true,
      primaryKinds: [],
      alternativesKinds: [],
      sourceInputMessageId: null,
    },
  },
  {
    name: "unreplied mark_duplicate without reply becomes null",
    input: {
      output: {
        summary: "Duplicate without acknowledgment",
        reasoning: "Should be rejected by normalize.",
        primary: [{ kind: "mark_duplicate", targetThreadId: "t-123" }],
        alternatives: [{ kind: "close" }],
        urgencyScore: 50,
        sourceInputMessageId: "m1",
      },
      messageIds: ["m1"],
      fallbackSourceInputMessageId: "m1",
      hasTeamReply: false,
    },
    expected: {
      shouldBeNull: true,
      primaryKinds: [],
      alternativesKinds: [],
      sourceInputMessageId: null,
    },
  },
  {
    name: "unreplied mark_duplicate with reply strips close alternative",
    input: {
      output: {
        summary: "Link duplicate and acknowledge customer",
        reasoning: "Bundled reply is valid.",
        primary: [
          { kind: "mark_duplicate", targetThreadId: "t-123" },
          {
            kind: "reply",
            draftMarkdown: "Thanks for reporting this — it matches an existing thread we are tracking.",
          },
        ],
        alternatives: [{ kind: "close" }],
        urgencyScore: 60,
        sourceInputMessageId: "m1",
      },
      messageIds: ["m1"],
      fallbackSourceInputMessageId: "m1",
      hasTeamReply: false,
    },
    expected: {
      shouldBeNull: false,
      primaryKinds: ["mark_duplicate", "reply"],
      alternativesKinds: [],
      sourceInputMessageId: "m1",
    },
  },
  {
    name: "close primary with trimmed reply alternative is preserved",
    input: {
      output: {
        summary: "Customer confirmed issue resolved",
        reasoning: "Latest message says we can close the thread.",
        primary: [{ kind: "close" }],
        alternatives: [
          {
            kind: "reply",
            draftMarkdown:
              "  Great, thanks for confirming. I will close this thread now.  ",
          },
        ],
        urgencyScore: 12,
        sourceInputMessageId: "m5",
      },
      messageIds: ["m4", "m5"],
      fallbackSourceInputMessageId: "m5",
      hasTeamReply: true,
    },
    expected: {
      shouldBeNull: false,
      primaryKinds: ["close"],
      alternativesKinds: ["reply"],
      sourceInputMessageId: "m5",
    },
  },
];
