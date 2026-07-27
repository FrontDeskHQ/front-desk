import type { AgentChatToolImplementations } from "../live-state/router/agent-chat-core";
import {
  THREAD_FIXTURES,
  DEFAULT_BILLING_DOC_RESULTS,
  DEFAULT_BUG_THREAD_SEARCH_RESULTS,
  DEFAULT_UPLOAD_BUG_THREAD_SEARCH_RESULTS,
  DUPLICATE_GET_THREAD_RESULT,
} from "./agent-chat.fixtures";
import type { ThreadFixture } from "./agent-chat.fixtures";

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface ToolSelectionTestCase {
  input: {
    userMessage: string;
    thread: ThreadFixture;
    toolOverrides?: Partial<AgentChatToolImplementations>;
  };
  expected: {
    tools: string[];
  };
}

export interface ProactiveToolTestCase {
  input: {
    userMessage: string;
    thread: ThreadFixture;
    suggestionsContext?: string;
    toolOverrides?: Partial<AgentChatToolImplementations>;
  };
  expected: {
    mustInclude: string[];
    mayAlsoInclude: string[];
  };
}

export interface DraftQualityTestCase {
  input: {
    userMessage: string;
    thread: ThreadFixture;
    toolOverrides?: Partial<AgentChatToolImplementations>;
  };
  expected: string; // Description of what the draft should address
}

export interface ThreadReferenceTestCase {
  input: {
    userMessage: string;
    thread: ThreadFixture;
    toolOverrides?: Partial<AgentChatToolImplementations>;
  };
  expected: {
    threadIds: string[];
    threadNames: string[];
  };
}

// ─── Tool Selection Dataset ──────────────────────────────────────────────────

export const toolSelectionDataset: ToolSelectionTestCase[] = [
  {
    expected: { tools: ["searchDocumentation", "searchThreads", "setDraft"] },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "Draft a reply to this customer",
    },
  },
  {
    expected: { tools: ["searchThreads"] },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "Search for similar issues about login failures",
    },
  },
  {
    expected: { tools: ["searchDocumentation"] },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "Look up our documentation on password reset procedures",
    },
  },
  {
    expected: { tools: ["getDraft"] },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "What does the current draft say?",
    },
  },
  {
    expected: { tools: ["listThreads"] },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "Show me recent urgent tickets",
    },
  },
  {
    expected: { tools: [] },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "What's the customer's name from this thread?",
    },
  },
  {
    expected: { tools: ["searchThreads", "searchDocumentation", "setDraft"] },
    input: {
      thread: THREAD_FIXTURES.technicalBug,
      userMessage:
        "Check if this issue has been reported before and then draft a response",
    },
  },
  {
    expected: { tools: ["getThread"] },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage:
        "Read through thread 01jnqxk5vg3mardze7tq0bn8yh and summarize it",
    },
  },
  {
    expected: { tools: ["searchDocumentation", "searchThreads", "setDraft"] },
    input: {
      thread: THREAD_FIXTURES.billingError,
      userMessage:
        "Find our docs about billing and then draft a reply explaining our refund policy",
    },
  },
  {
    expected: { tools: [] },
    input: {
      thread: THREAD_FIXTURES.billingError,
      userMessage: "Summarize this thread for me",
    },
  },
  {
    expected: { tools: ["getDraft", "setDraft"] },
    input: {
      thread: THREAD_FIXTURES.angryCustomer,
      toolOverrides: {
        getDraft: async () => ({
          hasDraft: true,
          content:
            "Hi Robert, sorry about the logout issue. Try clearing your cookies.",
        }),
      },
      userMessage: "Update the draft to be more formal and empathetic",
    },
  },
  {
    expected: { tools: ["listThreads"] },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "List all open high priority tickets",
    },
  },
];

// ─── Proactive Tool Usage Dataset ────────────────────────────────────────────

export const proactiveToolDataset: ProactiveToolTestCase[] = [
  {
    expected: {
      mayAlsoInclude: ["searchThreads"],
      mustInclude: ["searchDocumentation", "setDraft"],
    },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "Draft a reply",
    },
  },
  {
    expected: {
      mayAlsoInclude: ["searchThreads"],
      mustInclude: ["searchDocumentation", "setDraft"],
    },
    input: {
      thread: THREAD_FIXTURES.billingError,
      toolOverrides: {
        searchDocumentation: async () => DEFAULT_BILLING_DOC_RESULTS,
      },
      userMessage: "Help me respond to this",
    },
  },
  {
    expected: {
      mayAlsoInclude: ["searchDocumentation"],
      mustInclude: ["searchThreads", "setDraft"],
    },
    input: {
      thread: THREAD_FIXTURES.bugSeenByOthers,
      toolOverrides: {
        searchThreads: async () => DEFAULT_BUG_THREAD_SEARCH_RESULTS,
      },
      userMessage: "Draft a reply",
    },
  },
  {
    expected: {
      mayAlsoInclude: ["searchDocumentation"],
      mustInclude: ["getThread"],
    },
    input: {
      suggestionsContext: `
## Suggestions & Intelligence
The following suggestions have been automatically generated by our analysis system for this thread.
### Related Threads
These threads were identified as similar to the current thread based on content analysis. You can use the getThread tool with their _id to read their full conversation.
- "Webhook delivery delays" (_id: 01jnqxk5vg3mardze7tq0bn8yh, by John Davis, similarity: 85%)`,
      thread: THREAD_FIXTURES.knownIssue,
      userMessage: "What should I do with this ticket?",
    },
  },
  {
    expected: {
      mayAlsoInclude: [],
      mustInclude: ["searchDocumentation", "setDraft"],
    },
    input: {
      thread: THREAD_FIXTURES.refundRequest,
      toolOverrides: {
        searchDocumentation: async () => DEFAULT_BILLING_DOC_RESULTS,
      },
      userMessage: "Write a response explaining our refund policy",
    },
  },
  {
    expected: {
      mayAlsoInclude: ["searchDocumentation"],
      mustInclude: ["getThread", "setDraft"],
    },
    input: {
      suggestionsContext: `
## Suggestions & Intelligence
The following suggestions have been automatically generated by our analysis system for this thread.
### Possible Duplicate
This thread may be a duplicate of "Login page blank after deployment" (_id: 01jnqxkq2b8afshm6nqr0fwuve), confidence: high. Reason: Both report blank login page after recent changes.`,
      thread: THREAD_FIXTURES.duplicateThread,
      toolOverrides: {
        getThread: async () => DUPLICATE_GET_THREAD_RESULT,
      },
      userMessage: "Reply to this customer",
    },
  },
];

// ─── Draft Quality Dataset ───────────────────────────────────────────────────

export const draftQualityDataset: DraftQualityTestCase[] = [
  {
    expected:
      "The draft should acknowledge the duplicate charge, explain the refund process (3-5 business days), and ask for transaction ID or confirm the card details already provided. Professional and empathetic tone.",
    input: {
      thread: THREAD_FIXTURES.billingError,
      toolOverrides: {
        searchDocumentation: async () => DEFAULT_BILLING_DOC_RESULTS,
      },
      userMessage: "Draft a reply to help this customer",
    },
  },
  {
    expected:
      "The draft should acknowledge the file upload crash, mention the specific error (RangeError), and either provide troubleshooting steps or confirm the team is investigating. Should ask for any additional details if needed.",
    input: {
      thread: THREAD_FIXTURES.technicalBug,
      userMessage: "Write a reply for this bug report",
    },
  },
  {
    expected:
      "The draft should thank the customer for the suggestion, acknowledge dark mode as a valid request, and provide information about whether it's being considered or how feature requests are tracked. Should not make promises about timelines.",
    input: {
      thread: THREAD_FIXTURES.featureRequest,
      userMessage: "Draft a response to this feature request",
    },
  },
  {
    expected:
      "The draft should be highly empathetic, acknowledge the customer's frustration and repeated contacts, apologize sincerely, and offer a concrete next step (escalation, direct contact, or specific troubleshooting). Should address the refund request. Must not be dismissive.",
    input: {
      thread: THREAD_FIXTURES.angryCustomer,
      userMessage: "Help me draft a reply to de-escalate this situation",
    },
  },
];

// ─── Thread Reference Formatting Dataset ─────────────────────────────────────

export const threadReferenceDataset: ThreadReferenceTestCase[] = [
  {
    expected: {
      threadIds: ["01jnqxk5vg3mardze7tq0bn8yh", "01jnqxk8rp4bfcw2ax9d6e3tyn"],
      threadNames: [
        "Password reset link expired immediately",
        "Cannot log in after password change",
      ],
    },
    input: {
      thread: THREAD_FIXTURES.passwordReset,
      userMessage: "Search for similar issues to this one",
    },
  },
  {
    expected: {
      threadIds: ["01jnqxkbm7wstrjp5qnv0fhxkd", "01jnqxkdqz6yanwe8cr2g4mvpf"],
      threadNames: [
        "Search showing cross-workspace data",
        "Data leaking between workspaces in search",
      ],
    },
    input: {
      thread: THREAD_FIXTURES.bugSeenByOthers,
      toolOverrides: {
        searchThreads: async () => DEFAULT_BUG_THREAD_SEARCH_RESULTS,
      },
      userMessage: "Find related bug reports",
    },
  },
  {
    expected: {
      threadIds: ["01jnqxkrvw4ghmnp2bqt8fxdya", "01jnqxktwx5jknqr3csu9gyezb"],
      threadNames: [
        "File upload fails with large attachments",
        "App freezes during large CSV import",
      ],
    },
    input: {
      thread: THREAD_FIXTURES.technicalBug,
      toolOverrides: {
        searchThreads: async () => DEFAULT_UPLOAD_BUG_THREAD_SEARCH_RESULTS,
      },
      userMessage: "Are there any similar tickets?",
    },
  },
];
