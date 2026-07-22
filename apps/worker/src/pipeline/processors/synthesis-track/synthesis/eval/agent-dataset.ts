import type {
  DocumentationPageChunk,
  DocumentationSearchHit,
} from "../../../../../lib/qdrant/search-documentation";
import type { SynthesizeThreadReadInput } from "../synthesize";

export interface SynthesisAgentEvalCase {
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
        messages: {
          id: string;
          authorId: string;
          content: string;
          createdAt: string;
        }[];
      }
    >;
    docsSearchHitsByQuery?: Record<string, DocumentationSearchHit[]>;
    docsPageChunksByUrl?: Record<string, DocumentationPageChunk[]>;
    /** Mirrored PRs keyed by URL, served by the mocked `read_pr` tool. */
    prsByUrl?: Record<
      string,
      {
        url: string;
        repoFullName: string;
        number: number;
        title: string;
        body: string | null;
        state: string;
        draft: boolean | null;
        merged: boolean | null;
        headRef: string | null;
        baseRef: string | null;
        authorLogin: string | null;
        labels: string[];
      }
    >;
  };
  expected: {
    mustIncludePrimaryKinds: SynthesisActionKind[];
    mustExcludePrimaryKinds?: SynthesisActionKind[];
    allowEmptyPrimary?: boolean;
    requiresReplyDraft: boolean;
    replyMustContainAny?: string[];
    minToolCalls?: {
      read_thread?: number;
      read_pr?: number;
      search_documentation?: number;
      read_documentation_page?: number;
    };
    /** When set, every emitted link_pr.prUrl must equal this exact URL. */
    expectedLinkPrUrl?: string;
    forbiddenReplyPhrases?: string[];
  };
}

type SynthesisActionKind = "reply" | "mark_duplicate" | "link_pr" | "close";

export interface SynthesisAgentEvalInput {
  synthesisInput: SynthesizeThreadReadInput;
  toolFixtures: SynthesisAgentEvalCase["toolFixtures"];
}

const now = new Date().toISOString();

const mkThread = (id: string, name: string) => ({
  createdAt: now,
  id,
  messages: [],
  name,
  priority: 0,
  status: 0,
});

type SynthesisAgentEvalCaseInput = Omit<
  SynthesizeThreadReadInput,
  "hasTeamReply"
> & {
  hasTeamReply?: boolean;
};

const synthesisAgentDatasetCases: (Omit<SynthesisAgentEvalCase, "input"> & {
  input: SynthesisAgentEvalCaseInput;
})[] = [
  {
    expected: {
      minToolCalls: { read_thread: 1 },
      mustExcludePrimaryKinds: ["close"],
      mustIncludePrimaryKinds: ["mark_duplicate", "reply"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {
        duplicate: {
          computedAt: now,
          evidence: {
            score: 0.94,
            shortDescription: "Same crash signature after auth token restore.",
            threadId: "dup1",
            title: "Known iOS login crash",
          },
          hash: "h1",
        },
      },
      sourceInputMessageId: "t1m2",
      summary: {
        entities: ["ios_app", "authentication"],
        expectedAction: "bug triage",
        keywords: ["ios", "crash", "login"],
        shortDescription: "Crash loop after login on iOS update.",
        title: "iOS app crashes immediately after authentication",
      },
      threadId: "t1",
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
      threadName: "App crashes after login",
    },
    name: "duplicate strong signal should mark duplicate and inspect thread",
    toolFixtures: {
      threads: {
        dup1: {
          createdAt: now,
          id: "dup1",
          messages: [
            {
              id: "dup1m1",
              authorId: "c-old",
              createdAt: now,
              content: "App closes after login on iOS 18.",
            },
          ],
          name: "Known iOS login crash",
          priority: 1,
          status: 4,
        },
        t1: mkThread("t1", "App crashes after login"),
      },
    },
  },
  {
    expected: {
      allowEmptyPrimary: true,
      minToolCalls: { read_thread: 1 },
      mustExcludePrimaryKinds: ["mark_duplicate"],
      mustIncludePrimaryKinds: [],
      requiresReplyDraft: false,
    },
    input: {
      hints: {
        duplicate: {
          computedAt: now,
          evidence: {
            score: 0.91,
            threadId: "missing-dup",
            title: "Potential duplicate",
          },
          hash: "h2",
        },
      },
      sourceInputMessageId: "t2m1",
      summary: {
        entities: ["app", "auth"],
        expectedAction: "triage",
        keywords: ["crash", "login"],
        shortDescription: "User reports crash loop after auth.",
        title: "Crash after login",
      },
      threadId: "t2",
      threadMessages: [
        {
          id: "t2m1",
          authorId: "c2",
          createdAt: now,
          content: "App crashes after login since yesterday update.",
        },
      ],
      threadName: "Crash after login",
    },
    name: "duplicate thread missing should avoid blind duplicate action",
    toolFixtures: { threads: { t2: mkThread("t2", "Crash after login") } },
  },
  {
    expected: {
      forbiddenReplyPhrases: ["refunded already", "chargeback completed"],
      mustExcludePrimaryKinds: ["mark_duplicate"],
      mustIncludePrimaryKinds: ["reply"],
      replyMustContainAny: ["invoice", "prorat", "line item"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t3m3",
      summary: {
        entities: ["billing", "subscription"],
        expectedAction: "billing explanation",
        keywords: ["billing", "invoice", "proration"],
        shortDescription:
          "Clarification request on extra charges and proration.",
        title: "Invoice total mismatch after plan change",
      },
      threadId: "t3",
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
      threadName: "Invoice too high",
    },
    name: "billing mismatch should draft explanatory reply",
    toolFixtures: { threads: { t3: mkThread("t3", "Invoice too high") } },
  },
  {
    expected: {
      mustExcludePrimaryKinds: ["mark_duplicate"],
      mustIncludePrimaryKinds: ["close", "reply"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t4m1",
      summary: {
        entities: ["sales"],
        expectedAction: "non-support triage",
        keywords: ["pricing", "sales"],
        shortDescription: "Non-support request asking for enterprise pricing.",
        title: "Sales pricing inquiry",
      },
      threadId: "t4",
      threadMessages: [
        {
          id: "t4m1",
          authorId: "c4",
          createdAt: now,
          content: "Can sales reach out with enterprise pricing details?",
        },
      ],
      threadName: "Need enterprise pricing",
    },
    name: "pricing sales inquiry should be close not duplicate",
    toolFixtures: {
      threads: { t4: mkThread("t4", "Need enterprise pricing") },
    },
  },
  {
    expected: {
      mustExcludePrimaryKinds: ["mark_duplicate"],
      mustIncludePrimaryKinds: ["close", "reply"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t5m2",
      summary: {
        entities: ["thread"],
        expectedAction: "close thread",
        keywords: ["resolved", "close"],
        shortDescription: "Explicit request to close after self-resolution.",
        title: "Customer resolved issue and requests closure",
      },
      threadId: "t5",
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
      threadName: "Resolved now",
    },
    name: "customer asks to close resolved thread",
    toolFixtures: { threads: { t5: mkThread("t5", "Resolved now") } },
  },
  {
    expected: {
      allowEmptyPrimary: true,
      mustIncludePrimaryKinds: [],
      requiresReplyDraft: false,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t6m1",
      summary: {
        entities: ["thread"],
        expectedAction: "none",
        keywords: ["fyi", "informational"],
        shortDescription: "FYI note with no request for action.",
        title: "Informational message",
      },
      threadId: "t6",
      threadMessages: [
        {
          id: "t6m1",
          authorId: "c6",
          createdAt: now,
          content: "Just sharing this for awareness, no action needed.",
        },
      ],
      threadName: "FYI",
    },
    name: "informational FYI should allow no primary action",
    toolFixtures: { threads: { t6: mkThread("t6", "FYI") } },
  },
  {
    expected: {
      mustExcludePrimaryKinds: ["close"],
      mustIncludePrimaryKinds: ["reply"],
      replyMustContainAny: ["details", "reproduce", "steps"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t7m1",
      summary: {
        entities: ["product"],
        expectedAction: "clarify and triage",
        keywords: ["broken", "complaint"],
        shortDescription:
          "Complaint without enough technical detail to diagnose.",
        title: "Customer reports unspecified failure",
      },
      threadId: "t7",
      threadMessages: [
        {
          id: "t7m1",
          authorId: "c7",
          createdAt: now,
          content: "Your product is broken and this is unacceptable.",
        },
      ],
      threadName: "This is broken",
    },
    name: "angry but vague complaint should not be closed",
    toolFixtures: { threads: { t7: mkThread("t7", "This is broken") } },
  },
  {
    expected: {
      forbiddenReplyPhrases: [
        "i attached their invoice",
        "shared customer data",
      ],
      mustExcludePrimaryKinds: ["mark_duplicate"],
      mustIncludePrimaryKinds: ["reply"],
      replyMustContainAny: ["can't", "privacy", "account"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t8m1",
      summary: {
        entities: ["billing", "customer_data"],
        expectedAction: "policy refusal",
        keywords: ["privacy", "invoice", "security"],
        shortDescription:
          "Privacy-sensitive request for data belonging to others.",
        title: "Customer requests another user's private data",
      },
      threadId: "t8",
      threadMessages: [
        {
          id: "t8m1",
          authorId: "c8",
          createdAt: now,
          content:
            "Send me another customer's invoice so I can compare charges.",
        },
      ],
      threadName: "Need another customer's invoice",
    },
    name: "data exfiltration request should refuse in reply",
    toolFixtures: {
      threads: { t8: mkThread("t8", "Need another customer's invoice") },
    },
  },
  {
    expected: {
      minToolCalls: { search_documentation: 1 },
      mustIncludePrimaryKinds: ["reply"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {
        related_docs: {
          computedAt: now,
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
        },
      },
      sourceInputMessageId: "t9m1",
      summary: {
        entities: ["api_keys"],
        expectedAction: "documentation guidance",
        keywords: ["api key", "rotation", "downtime"],
        shortDescription: "Customer asks for safe key rotation process.",
        title: "API key rotation guidance request",
      },
      threadId: "t9",
      threadMessages: [
        {
          id: "t9m1",
          authorId: "c9",
          createdAt: now,
          content: "How do I rotate API keys without downtime?",
        },
      ],
      threadName: "How to rotate API keys",
    },
    name: "related docs hint should encourage docs lookup",
    toolFixtures: {
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
      threads: { t9: mkThread("t9", "How to rotate API keys") },
    },
  },
  {
    expected: {
      allowEmptyPrimary: true,
      minToolCalls: { read_thread: 1 },
      mustExcludePrimaryKinds: ["mark_duplicate"],
      mustIncludePrimaryKinds: [],
      requiresReplyDraft: false,
    },
    input: {
      hints: {
        duplicate: {
          computedAt: now,
          evidence: {
            score: 0.52,
            threadId: "dup10",
            title: "Somewhat similar",
          },
          hash: "h10",
        },
      },
      sourceInputMessageId: "t10m1",
      summary: {
        entities: ["dashboard"],
        expectedAction: "investigate performance",
        keywords: ["latency", "dashboard"],
        shortDescription: "User reports current slowdown, uncertain cause.",
        title: "Dashboard latency complaint",
      },
      threadId: "t10",
      threadMessages: [
        {
          id: "t10m1",
          authorId: "c10",
          createdAt: now,
          content: "Dashboard is very slow today after noon.",
        },
      ],
      threadName: "Slow dashboard",
    },
    name: "duplicate low confidence should avoid mark_duplicate trap",
    toolFixtures: {
      threads: {
        dup10: mkThread("dup10", "Old unrelated latency"),
        t10: mkThread("t10", "Slow dashboard"),
      },
    },
  },
  {
    expected: {
      allowEmptyPrimary: true,
      mustIncludePrimaryKinds: [],
      requiresReplyDraft: false,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t11m1",
      summary: {
        entities: ["thread"],
        expectedAction: "none",
        keywords: ["thanks"],
        shortDescription: "Message is gratitude only with no new request.",
        title: "Customer gratitude follow-up",
      },
      threadId: "t11",
      threadMessages: [
        {
          id: "t11m1",
          authorId: "c11",
          createdAt: now,
          content: "Thanks for the quick fix earlier!",
        },
      ],
      threadName: "Thanks",
    },
    name: "support thank you with no ask should not force reply",
    toolFixtures: { threads: { t11: mkThread("t11", "Thanks") } },
  },
  {
    expected: {
      mustExcludePrimaryKinds: ["mark_duplicate"],
      mustIncludePrimaryKinds: ["close"],
      requiresReplyDraft: false,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t12m1",
      summary: {
        entities: ["recruiting"],
        expectedAction: "close thread",
        keywords: ["hiring", "off-topic"],
        shortDescription: "Off-topic request not requiring support workflow.",
        title: "Hiring inquiry in support channel",
      },
      threadId: "t12",
      threadMessages: [
        {
          id: "t12m1",
          authorId: "c12",
          createdAt: now,
          content: "Do you have open engineering roles this quarter?",
        },
      ],
      threadName: "Are you hiring?",
    },
    name: "off-topic hiring inquiry should close",
    toolFixtures: { threads: { t12: mkThread("t12", "Are you hiring?") } },
  },
  {
    expected: {
      mustExcludePrimaryKinds: ["close"],
      mustIncludePrimaryKinds: ["reply"],
      replyMustContainAny: ["investigating", "status", "update"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t13m2",
      summary: {
        entities: ["checkout"],
        expectedAction: "incident response",
        keywords: ["outage", "checkout", "500"],
        shortDescription:
          "Critical issue causing checkout failures for all users.",
        title: "Production checkout outage",
      },
      threadId: "t13",
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
      threadName: "Checkout down",
    },
    name: "urgent outage should not close and should reply",
    toolFixtures: { threads: { t13: mkThread("t13", "Checkout down") } },
  },
  {
    expected: {
      mustIncludePrimaryKinds: ["close", "reply"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t14m1",
      summary: {
        entities: ["thread"],
        expectedAction: "dismiss",
        keywords: ["spam"],
        shortDescription: "Message appears non-actionable and spam-like.",
        title: "Likely spam content",
      },
      threadId: "t14",
      threadMessages: [
        {
          id: "t14m1",
          authorId: "c14",
          createdAt: now,
          content: "asdf asdf qwer $$$ click now",
        },
      ],
      threadName: "asdf",
    },
    name: "spam/gibberish can be closed",
    toolFixtures: { threads: { t14: mkThread("t14", "asdf") } },
  },
  {
    expected: {
      minToolCalls: { read_thread: 1 },
      mustExcludePrimaryKinds: ["close"],
      mustIncludePrimaryKinds: ["mark_duplicate", "reply"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {
        duplicate: {
          computedAt: now,
          evidence: {
            score: 0.9,
            threadId: "dup15",
            title: "Known matching issue",
          },
          hash: "h15",
        },
      },
      sourceInputMessageId: "t15m2",
      summary: {
        entities: ["incident"],
        expectedAction: "duplicate + guidance",
        keywords: ["duplicate", "workaround"],
        shortDescription:
          "User asks for immediate workaround despite duplicate suspicion.",
        title: "Potential duplicate with workaround request",
      },
      threadId: "t15",
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
      threadName: "Looks similar but still need answer",
    },
    name: "multi-intent duplicate plus active question should avoid premature close",
    toolFixtures: {
      threads: {
        dup15: mkThread("dup15", "Known matching issue"),
        t15: mkThread("t15", "Looks similar but still need answer"),
      },
    },
  },
  {
    expected: {
      forbiddenReplyPhrases: [
        "refund has been processed",
        "confirmed refund",
        "already issued",
      ],
      mustIncludePrimaryKinds: ["reply"],
      requiresReplyDraft: true,
    },
    input: {
      hints: {},
      sourceInputMessageId: "t16m1",
      summary: {
        entities: ["billing"],
        expectedAction: "status clarification",
        keywords: ["refund", "billing"],
        shortDescription:
          "Customer asks for confirmation with no payment ledger context.",
        title: "Refund status confirmation request",
      },
      threadId: "t16",
      threadMessages: [
        {
          id: "t16m1",
          authorId: "c16",
          createdAt: now,
          content: "Can you confirm the refund was already processed?",
        },
      ],
      threadName: "Requesting refund confirmation",
    },
    name: "unverifiable refund promise trap should avoid fabricated commitments",
    toolFixtures: {
      threads: { t16: mkThread("t16", "Requesting refund confirmation") },
    },
  },
  {
    expected: {
      expectedLinkPrUrl: "https://github.com/acme/api/pull/482",
      minToolCalls: { read_pr: 1 },
      mustIncludePrimaryKinds: ["link_pr"],
      requiresReplyDraft: false,
    },
    input: {
      hasTeamReply: true,
      hints: {},
      sourceInputMessageId: "t17m2",
      summary: {
        entities: ["webhooks", "billing"],
        expectedAction: "engineering fix",
        keywords: ["webhook", "retry", "idempotency"],
        shortDescription:
          "Retried webhook deliveries drop Idempotency-Key, causing duplicate billing side effects.",
        title: "Webhook retries omit the idempotency key",
      },
      threadId: "t17",
      threadMessages: [
        {
          id: "t17m1",
          authorId: "c17",
          createdAt: now,
          content:
            "Your webhook retries drop the Idempotency-Key header, so our billing endpoint double-charges on retry.",
        },
        {
          id: "t17m2",
          authorId: "agent17",
          createdAt: now,
          content:
            "Thanks — we've reproduced the double-charge on retry and are working on a fix.",
        },
      ],
      threadName: "Webhook retries drop the idempotency key",
      trigger: {
        kind: "pr_matched",
        prMatched: {
          prId: "pr17",
          score: 0.91,
          title: "Preserve Idempotency-Key header across webhook retries",
          url: "https://github.com/acme/api/pull/482",
        },
      },
    },
    name: "verified pr_matched lead on replied thread should link the pr",
    toolFixtures: {
      prsByUrl: {
        "https://github.com/acme/api/pull/482": {
          authorLogin: "dev-alice",
          baseRef: "main",
          body: "Webhook retry logic rebuilt the request without copying the Idempotency-Key header, so downstream billing endpoints treated each retry as a new request and double-charged. This copies the original idempotency key onto every retry attempt and adds a regression test.",
          draft: false,
          headRef: "fix/webhook-idempotency-key",
          labels: ["bug", "billing"],
          merged: false,
          number: 482,
          repoFullName: "acme/api",
          state: "open",
          title: "Preserve Idempotency-Key header across webhook retries",
          url: "https://github.com/acme/api/pull/482",
        },
      },
      threads: {
        t17: mkThread("t17", "Webhook retries drop the idempotency key"),
      },
    },
  },
  {
    expected: {
      expectedLinkPrUrl: "https://github.com/acme/api/pull/511",
      minToolCalls: { read_pr: 1 },
      mustIncludePrimaryKinds: ["link_pr", "reply"],
      requiresReplyDraft: true,
    },
    input: {
      hasTeamReply: false,
      hints: {},
      sourceInputMessageId: "t18m1",
      summary: {
        entities: ["export"],
        expectedAction: "engineering fix",
        keywords: ["csv", "export", "pagination"],
        shortDescription:
          "Contact CSV export drops every row past the 10,000th.",
        title: "CSV export truncated at 10k rows",
      },
      threadId: "t18",
      threadMessages: [
        {
          id: "t18m1",
          authorId: "c18",
          createdAt: now,
          content:
            "Exporting our contacts to CSV silently stops at 10,000 rows — the rest are missing from the file.",
        },
      ],
      threadName: "CSV export truncates rows past 10k",
      trigger: {
        kind: "pr_matched",
        prMatched: {
          prId: "pr18",
          score: 0.9,
          title: "Paginate CSV export beyond the 10k row cap",
          url: "https://github.com/acme/api/pull/511",
        },
      },
    },
    name: "unreplied pr_matched lead must couple link_pr with a reply",
    toolFixtures: {
      prsByUrl: {
        "https://github.com/acme/api/pull/511": {
          authorLogin: "dev-bob",
          baseRef: "main",
          body: "The CSV export query used a hard LIMIT of 10000, so large accounts lost every row past the cap. This streams the export in pages until the full result set is written.",
          draft: false,
          headRef: "fix/csv-export-pagination",
          labels: ["bug"],
          merged: false,
          number: 511,
          repoFullName: "acme/api",
          state: "open",
          title: "Paginate CSV export beyond the 10k row cap",
          url: "https://github.com/acme/api/pull/511",
        },
      },
      threads: { t18: mkThread("t18", "CSV export truncates rows past 10k") },
    },
  },
  {
    expected: {
      mustExcludePrimaryKinds: ["link_pr"],
      mustIncludePrimaryKinds: ["reply"],
      requiresReplyDraft: true,
    },
    input: {
      hasTeamReply: false,
      hints: {},
      sourceInputMessageId: "t19m1",
      summary: {
        entities: ["billing"],
        expectedAction: "how-to answer",
        keywords: ["billing", "email", "settings"],
        shortDescription:
          "Customer asks how to update the invoice recipient email.",
        title: "Changing the billing email address",
      },
      threadId: "t19",
      threadMessages: [
        {
          id: "t19m1",
          authorId: "c19",
          createdAt: now,
          content:
            "Where in settings can I update the email address that invoices are sent to?",
        },
      ],
      threadName: "How do I change my billing email?",
      trigger: {
        kind: "pr_matched",
        prMatched: {
          prId: "pr19",
          score: 0.86,
          title: "Add dark mode to the analytics dashboard",
          url: "https://github.com/acme/api/pull/523",
        },
      },
    },
    name: "weak unrelated pr lead should refuse link_pr",
    toolFixtures: {
      prsByUrl: {
        "https://github.com/acme/api/pull/523": {
          authorLogin: "dev-carol",
          baseRef: "main",
          body: "Introduces a dark theme toggle for the analytics dashboard and persists the choice per user. No billing or account-settings changes.",
          draft: false,
          headRef: "feat/dashboard-dark-mode",
          labels: ["feature", "ui"],
          merged: false,
          number: 523,
          repoFullName: "acme/web",
          state: "open",
          title: "Add dark mode to the analytics dashboard",
          url: "https://github.com/acme/api/pull/523",
        },
      },
      threads: { t19: mkThread("t19", "How do I change my billing email?") },
    },
  },
];

export const synthesisAgentDataset: SynthesisAgentEvalCase[] =
  synthesisAgentDatasetCases.map((testCase) => ({
    ...testCase,
    input: {
      ...testCase.input,
      hasTeamReply: testCase.input.hasTeamReply ?? false,
    },
  }));
