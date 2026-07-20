import type { SynthesisRawActionSet } from "../synthesize";

export type SynthesisEvalCase = {
  name: string;
  input: {
    output: SynthesisRawActionSet;
    messageIds: string[];
    fallbackSourceInputMessageId: string;
    hasTeamReply: boolean;
    /** When set, link_pr URLs not in this list are dropped during normalize. */
    verifiedPrUrls?: string[];
  };
  expected: {
    shouldBeNull: boolean;
    primaryKinds: Array<"reply" | "mark_duplicate" | "link_pr" | "close">;
    alternativesKinds: Array<"reply" | "mark_duplicate" | "link_pr" | "close">;
    sourceInputMessageId: string | null;
  };
};

export const synthesisDataset: SynthesisEvalCase[] = [
  {
    name: "empty primary becomes null read",
    input: {
      output: {
        summary: "No action needed",
        recommendation: "No reply, duplicate link, or close is justified yet.",
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
        recommendation: "Reply with an explanation of the invoice difference.",
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
        recommendation: "This is a duplicate of an existing thread.",
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
        recommendation: "Reply to acknowledge the customer.",
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
        recommendation: "This is a duplicate of an existing thread.",
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
        recommendation: "This is a duplicate of an existing thread.",
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
        recommendation:
          "This is a duplicate of an existing thread; reply to acknowledge the customer.",
        reasoning: "Bundled reply is valid.",
        primary: [
          { kind: "mark_duplicate", targetThreadId: "t-123" },
          {
            kind: "reply",
            draftMarkdown:
              "Thanks for reporting this — it matches an existing thread we are tracking.",
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
        recommendation:
          "Close the thread — the customer confirmed the issue is resolved.",
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
  {
    name: "link_pr primary keeps only the first across primary and alternatives",
    input: {
      output: {
        summary: "Customer hit a bug fixed by an open PR",
        recommendation: "Link the pull request that fixes this.",
        reasoning: "The open PR addresses the reported crash.",
        primary: [
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/1" },
        ],
        alternatives: [
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/2" },
        ],
        urgencyScore: 40,
        sourceInputMessageId: "m9",
      },
      messageIds: ["m9"],
      fallbackSourceInputMessageId: "m9",
      hasTeamReply: true,
    },
    expected: {
      shouldBeNull: false,
      primaryKinds: ["link_pr"],
      alternativesKinds: [],
      sourceInputMessageId: "m9",
    },
  },
  {
    name: "standalone link_pr on unreplied thread is dropped to null",
    input: {
      output: {
        summary: "Customer reported a bug an open PR fixes",
        recommendation: "Link the pull request that fixes this.",
        reasoning: "The open PR resolves the report, but nobody has replied.",
        primary: [
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/3" },
        ],
        alternatives: [],
        urgencyScore: 45,
        sourceInputMessageId: "m10",
      },
      messageIds: ["m10"],
      fallbackSourceInputMessageId: "m10",
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
    name: "link_pr coupled with reply on unreplied thread orders link_pr first",
    input: {
      output: {
        summary: "Customer reported a bug an open PR fixes",
        recommendation: "Link the pull request and let the customer know.",
        reasoning: "The open PR resolves the report; acknowledge the customer.",
        primary: [
          {
            kind: "reply",
            draftMarkdown:
              "Thanks for the detailed report — a fix for this is already in review and we'll let you know as soon as it ships.",
          },
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/4" },
        ],
        alternatives: [],
        urgencyScore: 50,
        sourceInputMessageId: "m11",
      },
      messageIds: ["m11"],
      fallbackSourceInputMessageId: "m11",
      hasTeamReply: false,
    },
    expected: {
      shouldBeNull: false,
      primaryKinds: ["link_pr", "reply"],
      alternativesKinds: [],
      sourceInputMessageId: "m11",
    },
  },
  {
    name: "unverified link_pr is dropped when verifiedPrUrls is provided",
    input: {
      output: {
        summary: "Customer hit a bug",
        recommendation: "Link the pull request that fixes this.",
        reasoning: "Model invented a PR URL without reading it.",
        primary: [
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/999" },
          {
            kind: "reply",
            draftMarkdown:
              "Thanks for the report — a fix for this is already in review.",
          },
        ],
        alternatives: [],
        urgencyScore: 40,
        sourceInputMessageId: "m12",
      },
      messageIds: ["m12"],
      fallbackSourceInputMessageId: "m12",
      hasTeamReply: true,
      // Successfully read a different PR — the fabricated URL must not pass.
      verifiedPrUrls: ["https://github.com/acme/api/pull/482"],
    },
    expected: {
      shouldBeNull: false,
      primaryKinds: ["reply"],
      alternativesKinds: [],
      sourceInputMessageId: "m12",
    },
  },
  {
    name: "standalone unverified link_pr becomes null when verifiedPrUrls is provided",
    input: {
      output: {
        summary: "Customer hit a bug",
        recommendation: "Link the pull request that fixes this.",
        reasoning: "Model emitted link_pr without a successful read_pr.",
        primary: [
          { kind: "link_pr", prUrl: "https://github.com/evil/repo/pull/1" },
        ],
        alternatives: [],
        urgencyScore: 40,
        sourceInputMessageId: "m13",
      },
      messageIds: ["m13"],
      fallbackSourceInputMessageId: "m13",
      hasTeamReply: true,
      verifiedPrUrls: [],
    },
    expected: {
      shouldBeNull: true,
      primaryKinds: [],
      alternativesKinds: [],
      sourceInputMessageId: null,
    },
  },
];
