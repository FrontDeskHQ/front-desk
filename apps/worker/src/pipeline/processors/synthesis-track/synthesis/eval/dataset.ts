import type { SynthesisRawActionSet } from "../synthesize";

export interface SynthesisEvalCase {
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
    primaryKinds: ("reply" | "mark_duplicate" | "link_pr" | "close")[];
    alternativesKinds: ("reply" | "mark_duplicate" | "link_pr" | "close")[];
    sourceInputMessageId: string | null;
  };
}

export const synthesisDataset: SynthesisEvalCase[] = [
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: [],
      shouldBeNull: true,
      sourceInputMessageId: null,
    },
    input: {
      fallbackSourceInputMessageId: "m2",
      hasTeamReply: true,
      messageIds: ["m1", "m2"],
      output: {
        alternatives: [],
        primary: [],
        reasoning: "No substantive move is justified.",
        recommendation: "No reply, duplicate link, or close is justified yet.",
        sourceInputMessageId: "m2",
        summary: "No action needed",
        urgencyScore: 10,
      },
    },
    name: "empty primary becomes null read",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: ["reply"],
      shouldBeNull: false,
      sourceInputMessageId: "m3",
    },
    input: {
      fallbackSourceInputMessageId: "m3",
      hasTeamReply: true,
      messageIds: ["m1", "m2", "m3"],
      output: {
        alternatives: [],
        primary: [
          {
            kind: "reply",
            draftMarkdown:
              "  Thanks for flagging this. I checked the invoice and the difference is from prorated usage after your mid-cycle plan change. If you want, I can break down each line item with dates so you can verify the total.  ",
          },
        ],
        reasoning:
          " Latest inbound asks why the invoice total differs from the expected plan price. ",
        recommendation: "Reply with an explanation of the invoice difference.",
        sourceInputMessageId: "m3",
        summary: "Customer reports invoice amount mismatch ",
        urgencyScore: 55,
      },
    },
    name: "reply draft is trimmed and source id is preserved when valid",
  },
  {
    expected: {
      alternativesKinds: ["close"],
      primaryKinds: ["mark_duplicate"],
      shouldBeNull: false,
      sourceInputMessageId: "m8",
    },
    input: {
      fallbackSourceInputMessageId: "m8",
      hasTeamReply: true,
      messageIds: ["m7", "m8"],
      output: {
        alternatives: [{ kind: "close" }],
        primary: [{ kind: "mark_duplicate", targetThreadId: "t-123" }],
        reasoning: "Hint points strongly to an existing thread.",
        recommendation: "This is a duplicate of an existing thread.",
        sourceInputMessageId: "missing-message",
        summary: "Likely duplicate report",
        urgencyScore: 72,
      },
    },
    name: "invalid source id falls back to latest known message id",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: [],
      shouldBeNull: true,
      sourceInputMessageId: null,
    },
    input: {
      fallbackSourceInputMessageId: "m1",
      hasTeamReply: true,
      messageIds: ["m1"],
      output: {
        alternatives: [],
        primary: [{ kind: "reply", draftMarkdown: "   " }],
        reasoning: "Model proposed an empty draft.",
        recommendation: "Reply to acknowledge the customer.",
        sourceInputMessageId: "m1",
        summary: "No useful reply content",
        urgencyScore: 20,
      },
    },
    name: "blank reply draft is dropped and can null the read",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: [],
      shouldBeNull: true,
      sourceInputMessageId: null,
    },
    input: {
      fallbackSourceInputMessageId: "m1",
      hasTeamReply: true,
      messageIds: ["m1"],
      output: {
        alternatives: [{ kind: "close" }],
        primary: [{ kind: "mark_duplicate", targetThreadId: "   " }],
        reasoning: "Model attempted mark_duplicate without a real target id.",
        recommendation: "This is a duplicate of an existing thread.",
        sourceInputMessageId: "m1",
        summary: "Duplicate target is missing",
        urgencyScore: 30,
      },
    },
    name: "blank duplicate target is dropped and falls back to null",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: [],
      shouldBeNull: true,
      sourceInputMessageId: null,
    },
    input: {
      fallbackSourceInputMessageId: "m1",
      hasTeamReply: false,
      messageIds: ["m1"],
      output: {
        alternatives: [{ kind: "close" }],
        primary: [{ kind: "mark_duplicate", targetThreadId: "t-123" }],
        reasoning: "Should be rejected by normalize.",
        recommendation: "This is a duplicate of an existing thread.",
        sourceInputMessageId: "m1",
        summary: "Duplicate without acknowledgment",
        urgencyScore: 50,
      },
    },
    name: "unreplied mark_duplicate without reply becomes null",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: ["mark_duplicate", "reply"],
      shouldBeNull: false,
      sourceInputMessageId: "m1",
    },
    input: {
      fallbackSourceInputMessageId: "m1",
      hasTeamReply: false,
      messageIds: ["m1"],
      output: {
        alternatives: [{ kind: "close" }],
        primary: [
          { kind: "mark_duplicate", targetThreadId: "t-123" },
          {
            kind: "reply",
            draftMarkdown:
              "Thanks for reporting this — it matches an existing thread we are tracking.",
          },
        ],
        reasoning: "Bundled reply is valid.",
        recommendation:
          "This is a duplicate of an existing thread; reply to acknowledge the customer.",
        sourceInputMessageId: "m1",
        summary: "Link duplicate and acknowledge customer",
        urgencyScore: 60,
      },
    },
    name: "unreplied mark_duplicate with reply strips close alternative",
  },
  {
    expected: {
      alternativesKinds: ["reply"],
      primaryKinds: ["close"],
      shouldBeNull: false,
      sourceInputMessageId: "m5",
    },
    input: {
      fallbackSourceInputMessageId: "m5",
      hasTeamReply: true,
      messageIds: ["m4", "m5"],
      output: {
        alternatives: [
          {
            kind: "reply",
            draftMarkdown:
              "  Great, thanks for confirming. I will close this thread now.  ",
          },
        ],
        primary: [{ kind: "close" }],
        reasoning: "Latest message says we can close the thread.",
        recommendation:
          "Close the thread — the customer confirmed the issue is resolved.",
        sourceInputMessageId: "m5",
        summary: "Customer confirmed issue resolved",
        urgencyScore: 12,
      },
    },
    name: "close primary with trimmed reply alternative is preserved",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: ["link_pr"],
      shouldBeNull: false,
      sourceInputMessageId: "m9",
    },
    input: {
      fallbackSourceInputMessageId: "m9",
      hasTeamReply: true,
      messageIds: ["m9"],
      output: {
        alternatives: [
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/2" },
        ],
        primary: [
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/1" },
        ],
        reasoning: "The open PR addresses the reported crash.",
        recommendation: "Link the pull request that fixes this.",
        sourceInputMessageId: "m9",
        summary: "Customer hit a bug fixed by an open PR",
        urgencyScore: 40,
      },
    },
    name: "link_pr primary keeps only the first across primary and alternatives",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: [],
      shouldBeNull: true,
      sourceInputMessageId: null,
    },
    input: {
      fallbackSourceInputMessageId: "m10",
      hasTeamReply: false,
      messageIds: ["m10"],
      output: {
        alternatives: [],
        primary: [
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/3" },
        ],
        reasoning: "The open PR resolves the report, but nobody has replied.",
        recommendation: "Link the pull request that fixes this.",
        sourceInputMessageId: "m10",
        summary: "Customer reported a bug an open PR fixes",
        urgencyScore: 45,
      },
    },
    name: "standalone link_pr on unreplied thread is dropped to null",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: ["link_pr", "reply"],
      shouldBeNull: false,
      sourceInputMessageId: "m11",
    },
    input: {
      fallbackSourceInputMessageId: "m11",
      hasTeamReply: false,
      messageIds: ["m11"],
      output: {
        alternatives: [],
        primary: [
          {
            kind: "reply",
            draftMarkdown:
              "Thanks for the detailed report — a fix for this is already in review and we'll let you know as soon as it ships.",
          },
          { kind: "link_pr", prUrl: "https://github.com/acme/api/pull/4" },
        ],
        reasoning: "The open PR resolves the report; acknowledge the customer.",
        recommendation: "Link the pull request and let the customer know.",
        sourceInputMessageId: "m11",
        summary: "Customer reported a bug an open PR fixes",
        urgencyScore: 50,
      },
    },
    name: "link_pr coupled with reply on unreplied thread orders link_pr first",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: [],
      shouldBeNull: true,
      sourceInputMessageId: null,
    },
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
      // Dropping only link_pr would leave a stale "Link the PR" recommendation
      // over a reply-only primary, so the whole set is discarded.
      verifiedPrUrls: ["https://github.com/acme/api/pull/482"],
    },
    name: "unverified primary link_pr becomes null (avoids stale recommendation)",
  },
  {
    expected: {
      alternativesKinds: [],
      primaryKinds: [],
      shouldBeNull: true,
      sourceInputMessageId: null,
    },
    input: {
      fallbackSourceInputMessageId: "m13",
      hasTeamReply: true,
      messageIds: ["m13"],
      output: {
        alternatives: [],
        primary: [
          { kind: "link_pr", prUrl: "https://github.com/evil/repo/pull/1" },
        ],
        reasoning: "Model emitted link_pr without a successful read_pr.",
        recommendation: "Link the pull request that fixes this.",
        sourceInputMessageId: "m13",
        summary: "Customer hit a bug",
        urgencyScore: 40,
      },
      verifiedPrUrls: [],
    },
    name: "standalone unverified link_pr becomes null when verifiedPrUrls is provided",
  },
];
