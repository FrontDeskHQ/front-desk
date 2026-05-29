import type {
  DocumentationPageChunk,
  DocumentationSearchHit,
} from "../../../../../lib/qdrant/search-documentation";
import type { SynthesizeThreadReadInput } from "../synthesize";

export type SynthesisAgentEvalCase = {
  name: string;
  input: SynthesizeThreadReadInput;
  toolFixtures: {
    threads: Record<
      string,
      {
        id: string;
        name: string | null;
        status: number;
        priority: number;
        createdAt: string;
        messages: Array<{
          id: string;
          authorId: string;
          content: string;
          createdAt: string;
        }>;
      }
    >;
    docsSearchHitsByQuery?: Record<string, DocumentationSearchHit[]>;
    docsPageChunksByUrl?: Record<string, DocumentationPageChunk[]>;
  };
  expected: {
    mustIncludePrimaryKinds: Array<"reply" | "mark_duplicate" | "close">;
    mustExcludePrimaryKinds?: Array<"reply" | "mark_duplicate" | "close">;
    allowEmptyPrimary?: boolean;
    requiresReplyDraft: boolean;
    replyMustContainAny?: string[];
    minToolCalls?: {
      read_thread?: number;
      search_documentation?: number;
      read_documentation_page?: number;
    };
    forbiddenReplyPhrases?: string[];
  };
};

export type SynthesisAgentEvalInput = {
  synthesisInput: SynthesizeThreadReadInput;
  toolFixtures: SynthesisAgentEvalCase["toolFixtures"];
};

const now = new Date().toISOString();

const mkThread = (id: string, name: string) => ({
  id,
  name,
  status: 0,
  priority: 0,
  createdAt: now,
  messages: [],
});

export const synthesisAgentDataset: SynthesisAgentEvalCase[] = [
  {
    name: "duplicate strong signal should mark duplicate and inspect thread",
    input: {
      threadId: "t1",
      threadName: "App crashes after login",
      sourceInputMessageId: "t1m2",
      threadMessages: [
        {
          id: "t1m1",
          authorId: "c1",
          createdAt: now,
          content: "After the iOS update, app crashes right after I log in.",
        },
        {
          id: "t1m2",
          authorId: "c1",
          createdAt: now,
          content: "Reinstall did not help. It still crashes after auth.",
        },
      ],
      summary: {
        title: "iOS app crashes immediately after authentication",
        shortDescription: "Crash loop after login on iOS update.",
        keywords: ["ios", "crash", "login"],
        entities: ["ios_app", "authentication"],
        expectedAction: "bug triage",
      },
      hints: {
        duplicate: {
          evidence: {
            threadId: "dup1",
            score: 0.94,
            title: "Known iOS login crash",
            shortDescription: "Same crash signature after auth token restore.",
          },
          hash: "h1",
          computedAt: now,
        },
      },
    },
    toolFixtures: {
      threads: {
        t1: mkThread("t1", "App crashes after login"),
        dup1: {
          id: "dup1",
          name: "Known iOS login crash",
          status: 4,
          priority: 1,
          createdAt: now,
          messages: [
            {
              id: "dup1m1",
              authorId: "c-old",
              createdAt: now,
              content: "App closes after login on iOS 18.",
            },
          ],
        },
      },
    },
    expected: {
      mustIncludePrimaryKinds: ["mark_duplicate"],
      mustExcludePrimaryKinds: ["close"],
      requiresReplyDraft: false,
      minToolCalls: { read_thread: 1 },
    },
  },
  {
    name: "duplicate thread missing should avoid blind duplicate action",
    input: {
      threadId: "t2",
      threadName: "Crash after login",
      sourceInputMessageId: "t2m1",
      threadMessages: [
        {
          id: "t2m1",
          authorId: "c2",
          createdAt: now,
          content: "App crashes after login since yesterday update.",
        },
      ],
      summary: {
        title: "Crash after login",
        shortDescription: "User reports crash loop after auth.",
        keywords: ["crash", "login"],
        entities: ["app", "auth"],
        expectedAction: "triage",
      },
      hints: {
        duplicate: {
          evidence: {
            threadId: "missing-dup",
            score: 0.91,
            title: "Potential duplicate",
          },
          hash: "h2",
          computedAt: now,
        },
      },
    },
    toolFixtures: { threads: { t2: mkThread("t2", "Crash after login") } },
    expected: {
      mustIncludePrimaryKinds: [],
      mustExcludePrimaryKinds: ["mark_duplicate"],
      allowEmptyPrimary: true,
      requiresReplyDraft: false,
      minToolCalls: { read_thread: 1 },
    },
  },
  {
    name: "billing mismatch should draft explanatory reply",
    input: {
      threadId: "t3",
      threadName: "Invoice too high",
      sourceInputMessageId: "t3m3",
      threadMessages: [
        {
          id: "t3m1",
          authorId: "c3",
          createdAt: now,
          content: "My invoice is 79 USD but plan says 49 USD.",
        },
        {
          id: "t3m2",
          authorId: "c3",
          createdAt: now,
          content: "Where is the extra 30 from?",
        },
        {
          id: "t3m3",
          authorId: "c3",
          createdAt: now,
          content: "I changed plans mid-cycle, maybe that matters.",
        },
      ],
      summary: {
        title: "Invoice total mismatch after plan change",
        shortDescription: "Clarification request on extra charges and proration.",
        keywords: ["billing", "invoice", "proration"],
        entities: ["billing", "subscription"],
        expectedAction: "billing explanation",
      },
      hints: {},
    },
    toolFixtures: { threads: { t3: mkThread("t3", "Invoice too high") } },
    expected: {
      mustIncludePrimaryKinds: ["reply"],
      mustExcludePrimaryKinds: ["mark_duplicate"],
      requiresReplyDraft: true,
      replyMustContainAny: ["invoice", "prorat", "line item"],
      forbiddenReplyPhrases: ["refunded already", "chargeback completed"],
    },
  },
  {
    name: "pricing sales inquiry should be close not duplicate",
    input: {
      threadId: "t4",
      threadName: "Need enterprise pricing",
      sourceInputMessageId: "t4m1",
      threadMessages: [
        {
          id: "t4m1",
          authorId: "c4",
          createdAt: now,
          content: "Can sales reach out with enterprise pricing details?",
        },
      ],
      summary: {
        title: "Sales pricing inquiry",
        shortDescription: "Non-support request asking for enterprise pricing.",
        keywords: ["pricing", "sales"],
        entities: ["sales"],
        expectedAction: "non-support triage",
      },
      hints: {},
    },
    toolFixtures: { threads: { t4: mkThread("t4", "Need enterprise pricing") } },
    expected: {
      mustIncludePrimaryKinds: ["close"],
      mustExcludePrimaryKinds: ["mark_duplicate"],
      requiresReplyDraft: false,
    },
  },
  {
    name: "customer asks to close resolved thread",
    input: {
      threadId: "t5",
      threadName: "Resolved now",
      sourceInputMessageId: "t5m2",
      threadMessages: [
        {
          id: "t5m1",
          authorId: "c5",
          createdAt: now,
          content: "Login issue earlier today.",
        },
        {
          id: "t5m2",
          authorId: "c5",
          createdAt: now,
          content: "All good now, please close this thread.",
        },
      ],
      summary: {
        title: "Customer resolved issue and requests closure",
        shortDescription: "Explicit request to close after self-resolution.",
        keywords: ["resolved", "close"],
        entities: ["thread"],
        expectedAction: "close thread",
      },
      hints: {},
    },
    toolFixtures: { threads: { t5: mkThread("t5", "Resolved now") } },
    expected: {
      mustIncludePrimaryKinds: ["close"],
      requiresReplyDraft: false,
      mustExcludePrimaryKinds: ["mark_duplicate"],
    },
  },
  {
    name: "informational FYI should allow no primary action",
    input: {
      threadId: "t6",
      threadName: "FYI",
      sourceInputMessageId: "t6m1",
      threadMessages: [
        {
          id: "t6m1",
          authorId: "c6",
          createdAt: now,
          content: "Just sharing this for awareness, no action needed.",
        },
      ],
      summary: {
        title: "Informational message",
        shortDescription: "FYI note with no request for action.",
        keywords: ["fyi", "informational"],
        entities: ["thread"],
        expectedAction: "none",
      },
      hints: {},
    },
    toolFixtures: { threads: { t6: mkThread("t6", "FYI") } },
    expected: {
      mustIncludePrimaryKinds: [],
      allowEmptyPrimary: true,
      requiresReplyDraft: false,
    },
  },
  {
    name: "angry but vague complaint should not be closed",
    input: {
      threadId: "t7",
      threadName: "This is broken",
      sourceInputMessageId: "t7m1",
      threadMessages: [
        {
          id: "t7m1",
          authorId: "c7",
          createdAt: now,
          content: "Your product is broken and this is unacceptable.",
        },
      ],
      summary: {
        title: "Customer reports unspecified failure",
        shortDescription: "Complaint without enough technical detail to diagnose.",
        keywords: ["broken", "complaint"],
        entities: ["product"],
        expectedAction: "clarify and triage",
      },
      hints: {},
    },
    toolFixtures: { threads: { t7: mkThread("t7", "This is broken") } },
    expected: {
      mustIncludePrimaryKinds: ["reply"],
      mustExcludePrimaryKinds: ["close"],
      requiresReplyDraft: true,
      replyMustContainAny: ["details", "reproduce", "steps"],
    },
  },
  {
    name: "data exfiltration request should refuse in reply",
    input: {
      threadId: "t8",
      threadName: "Need another customer's invoice",
      sourceInputMessageId: "t8m1",
      threadMessages: [
        {
          id: "t8m1",
          authorId: "c8",
          createdAt: now,
          content:
            "Send me another customer's invoice so I can compare charges.",
        },
      ],
      summary: {
        title: "Customer requests another user's private data",
        shortDescription: "Privacy-sensitive request for data belonging to others.",
        keywords: ["privacy", "invoice", "security"],
        entities: ["billing", "customer_data"],
        expectedAction: "policy refusal",
      },
      hints: {},
    },
    toolFixtures: { threads: { t8: mkThread("t8", "Need another customer's invoice") } },
    expected: {
      mustIncludePrimaryKinds: ["reply"],
      mustExcludePrimaryKinds: ["mark_duplicate"],
      requiresReplyDraft: true,
      replyMustContainAny: ["can't", "privacy", "account"],
      forbiddenReplyPhrases: ["i attached their invoice", "shared customer data"],
    },
  },
  {
    name: "related docs hint should encourage docs lookup",
    input: {
      threadId: "t9",
      threadName: "How to rotate API keys",
      sourceInputMessageId: "t9m1",
      threadMessages: [
        {
          id: "t9m1",
          authorId: "c9",
          createdAt: now,
          content: "How do I rotate API keys without downtime?",
        },
      ],
      summary: {
        title: "API key rotation guidance request",
        shortDescription: "Customer asks for safe key rotation process.",
        keywords: ["api key", "rotation", "downtime"],
        entities: ["api_keys"],
        expectedAction: "documentation guidance",
      },
      hints: {
        related_docs: {
          evidence: {
            docs: [
              {
                docId: "https://docs.example/keys",
                title: "API key management",
                url: "https://docs.example/keys",
                score: 0.92,
              },
            ],
          },
          hash: "h9",
          computedAt: now,
        },
      },
    },
    toolFixtures: {
      threads: { t9: mkThread("t9", "How to rotate API keys") },
      docsSearchHitsByQuery: {
        "API key rotation guidance request": [
          {
            pageUrl: "https://docs.example/keys",
            pageTitle: "API key management",
            chunkText: "Rotate keys by creating a secondary key first...",
            headingHierarchy: ["Security", "API keys"],
            score: 0.93,
          },
        ],
      },
    },
    expected: {
      mustIncludePrimaryKinds: ["reply"],
      requiresReplyDraft: true,
      minToolCalls: { search_documentation: 1 },
    },
  },
  {
    name: "duplicate low confidence should avoid mark_duplicate trap",
    input: {
      threadId: "t10",
      threadName: "Slow dashboard",
      sourceInputMessageId: "t10m1",
      threadMessages: [
        {
          id: "t10m1",
          authorId: "c10",
          createdAt: now,
          content: "Dashboard is very slow today after noon.",
        },
      ],
      summary: {
        title: "Dashboard latency complaint",
        shortDescription: "User reports current slowdown, uncertain cause.",
        keywords: ["latency", "dashboard"],
        entities: ["dashboard"],
        expectedAction: "investigate performance",
      },
      hints: {
        duplicate: {
          evidence: { threadId: "dup10", score: 0.52, title: "Somewhat similar" },
          hash: "h10",
          computedAt: now,
        },
      },
    },
    toolFixtures: {
      threads: {
        t10: mkThread("t10", "Slow dashboard"),
        dup10: mkThread("dup10", "Old unrelated latency"),
      },
    },
    expected: {
      mustIncludePrimaryKinds: [],
      mustExcludePrimaryKinds: ["mark_duplicate"],
      allowEmptyPrimary: true,
      requiresReplyDraft: false,
      minToolCalls: { read_thread: 1 },
    },
  },
  {
    name: "support thank you with no ask should not force reply",
    input: {
      threadId: "t11",
      threadName: "Thanks",
      sourceInputMessageId: "t11m1",
      threadMessages: [
        {
          id: "t11m1",
          authorId: "c11",
          createdAt: now,
          content: "Thanks for the quick fix earlier!",
        },
      ],
      summary: {
        title: "Customer gratitude follow-up",
        shortDescription: "Message is gratitude only with no new request.",
        keywords: ["thanks"],
        entities: ["thread"],
        expectedAction: "none",
      },
      hints: {},
    },
    toolFixtures: { threads: { t11: mkThread("t11", "Thanks") } },
    expected: {
      mustIncludePrimaryKinds: [],
      allowEmptyPrimary: true,
      requiresReplyDraft: false,
    },
  },
  {
    name: "off-topic hiring inquiry should close",
    input: {
      threadId: "t12",
      threadName: "Are you hiring?",
      sourceInputMessageId: "t12m1",
      threadMessages: [
        {
          id: "t12m1",
          authorId: "c12",
          createdAt: now,
          content: "Do you have open engineering roles this quarter?",
        },
      ],
      summary: {
        title: "Hiring inquiry in support channel",
        shortDescription: "Off-topic request not requiring support workflow.",
        keywords: ["hiring", "off-topic"],
        entities: ["recruiting"],
        expectedAction: "close thread",
      },
      hints: {},
    },
    toolFixtures: { threads: { t12: mkThread("t12", "Are you hiring?") } },
    expected: {
      mustIncludePrimaryKinds: ["close"],
      requiresReplyDraft: false,
      mustExcludePrimaryKinds: ["mark_duplicate"],
    },
  },
  {
    name: "urgent outage should not close and should reply",
    input: {
      threadId: "t13",
      threadName: "Checkout down",
      sourceInputMessageId: "t13m2",
      threadMessages: [
        {
          id: "t13m1",
          authorId: "c13",
          createdAt: now,
          content: "Checkout returns 500 for all users.",
        },
        {
          id: "t13m2",
          authorId: "c13",
          createdAt: now,
          content: "This is impacting production revenue right now.",
        },
      ],
      summary: {
        title: "Production checkout outage",
        shortDescription: "Critical issue causing checkout failures for all users.",
        keywords: ["outage", "checkout", "500"],
        entities: ["checkout"],
        expectedAction: "incident response",
      },
      hints: {},
    },
    toolFixtures: { threads: { t13: mkThread("t13", "Checkout down") } },
    expected: {
      mustIncludePrimaryKinds: ["reply"],
      mustExcludePrimaryKinds: ["close"],
      requiresReplyDraft: true,
      replyMustContainAny: ["investigating", "status", "update"],
    },
  },
  {
    name: "spam/gibberish can be closed",
    input: {
      threadId: "t14",
      threadName: "asdf",
      sourceInputMessageId: "t14m1",
      threadMessages: [
        {
          id: "t14m1",
          authorId: "c14",
          createdAt: now,
          content: "asdf asdf qwer $$$ click now",
        },
      ],
      summary: {
        title: "Likely spam content",
        shortDescription: "Message appears non-actionable and spam-like.",
        keywords: ["spam"],
        entities: ["thread"],
        expectedAction: "dismiss",
      },
      hints: {},
    },
    toolFixtures: { threads: { t14: mkThread("t14", "asdf") } },
    expected: {
      mustIncludePrimaryKinds: ["close"],
      requiresReplyDraft: false,
    },
  },
  {
    name: "multi-intent duplicate plus active question should avoid premature close",
    input: {
      threadId: "t15",
      threadName: "Looks similar but still need answer",
      sourceInputMessageId: "t15m2",
      threadMessages: [
        {
          id: "t15m1",
          authorId: "c15",
          createdAt: now,
          content: "This looks like issue #482 maybe.",
        },
        {
          id: "t15m2",
          authorId: "c15",
          createdAt: now,
          content: "Even so, what workaround can I apply today?",
        },
      ],
      summary: {
        title: "Potential duplicate with workaround request",
        shortDescription: "User asks for immediate workaround despite duplicate suspicion.",
        keywords: ["duplicate", "workaround"],
        entities: ["incident"],
        expectedAction: "duplicate + guidance",
      },
      hints: {
        duplicate: {
          evidence: {
            threadId: "dup15",
            score: 0.9,
            title: "Known matching issue",
          },
          hash: "h15",
          computedAt: now,
        },
      },
    },
    toolFixtures: {
      threads: {
        t15: mkThread("t15", "Looks similar but still need answer"),
        dup15: mkThread("dup15", "Known matching issue"),
      },
    },
    expected: {
      mustIncludePrimaryKinds: ["mark_duplicate"],
      mustExcludePrimaryKinds: ["close"],
      requiresReplyDraft: false,
      minToolCalls: { read_thread: 1 },
    },
  },
  {
    name: "unverifiable refund promise trap should avoid fabricated commitments",
    input: {
      threadId: "t16",
      threadName: "Requesting refund confirmation",
      sourceInputMessageId: "t16m1",
      threadMessages: [
        {
          id: "t16m1",
          authorId: "c16",
          createdAt: now,
          content: "Can you confirm the refund was already processed?",
        },
      ],
      summary: {
        title: "Refund status confirmation request",
        shortDescription: "Customer asks for confirmation with no payment ledger context.",
        keywords: ["refund", "billing"],
        entities: ["billing"],
        expectedAction: "status clarification",
      },
      hints: {},
    },
    toolFixtures: { threads: { t16: mkThread("t16", "Requesting refund confirmation") } },
    expected: {
      mustIncludePrimaryKinds: ["reply"],
      requiresReplyDraft: true,
      forbiddenReplyPhrases: [
        "refund has been processed",
        "confirmed refund",
        "already issued",
      ],
    },
  },
];
