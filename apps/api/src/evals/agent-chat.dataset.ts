import {
  THREAD_FIXTURES,
  DEFAULT_BILLING_DOC_RESULTS,
  DEFAULT_BUG_THREAD_SEARCH_RESULTS,
  DEFAULT_UPLOAD_BUG_THREAD_SEARCH_RESULTS,
  DUPLICATE_GET_THREAD_RESULT,
  type ThreadFixture,
} from "./agent-chat.fixtures";
import type { AgentChatToolImplementations } from "../live-state/router/agent-chat-core";

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
    input: {
      userMessage: "Draft a reply to this customer",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: { tools: ["searchDocumentation", "searchThreads", "setDraft"] },
  },
  {
    input: {
      userMessage: "Search for similar issues about login failures",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: { tools: ["searchThreads"] },
  },
  {
    input: {
      userMessage: "Look up our documentation on password reset procedures",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: { tools: ["searchDocumentation"] },
  },
  {
    input: {
      userMessage: "What does the current draft say?",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: { tools: ["getDraft"] },
  },
  {
    input: {
      userMessage: "Show me recent urgent tickets",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: { tools: ["listThreads"] },
  },
  {
    input: {
      userMessage: "What's the customer's name from this thread?",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: { tools: [] },
  },
  {
    input: {
      userMessage:
        "Check if this issue has been reported before and then draft a response",
      thread: THREAD_FIXTURES.technicalBug,
    },
    expected: { tools: ["searchThreads", "searchDocumentation", "setDraft"] },
  },
  {
    input: {
      userMessage: "Read through thread 01jnqxk5vg3mardze7tq0bn8yh and summarize it",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: { tools: ["getThread"] },
  },
  {
    input: {
      userMessage:
        "Find our docs about billing and then draft a reply explaining our refund policy",
      thread: THREAD_FIXTURES.billingError,
    },
    expected: { tools: ["searchDocumentation", "searchThreads", "setDraft"] },
  },
  {
    input: {
      userMessage: "Summarize this thread for me",
      thread: THREAD_FIXTURES.billingError,
    },
    expected: { tools: [] },
  },
  {
    input: {
      userMessage: "Update the draft to be more formal and empathetic",
      thread: THREAD_FIXTURES.angryCustomer,
      toolOverrides: {
        getDraft: async () => ({
          hasDraft: true,
          content:
            "Hi Robert, sorry about the logout issue. Try clearing your cookies.",
        }),
      },
    },
    expected: { tools: ["getDraft", "setDraft"] },
  },
  {
    input: {
      userMessage: "List all open high priority tickets",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: { tools: ["listThreads"] },
  },
];

// ─── Proactive Tool Usage Dataset ────────────────────────────────────────────

export const proactiveToolDataset: ProactiveToolTestCase[] = [
  {
    input: {
      userMessage: "Draft a reply",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: {
      mustInclude: ["searchDocumentation", "setDraft"],
      mayAlsoInclude: ["searchThreads"],
    },
  },
  {
    input: {
      userMessage: "Help me respond to this",
      thread: THREAD_FIXTURES.billingError,
      toolOverrides: {
        searchDocumentation: async () => DEFAULT_BILLING_DOC_RESULTS,
      },
    },
    expected: {
      mustInclude: ["searchDocumentation", "setDraft"],
      mayAlsoInclude: ["searchThreads"],
    },
  },
  {
    input: {
      userMessage: "Draft a reply",
      thread: THREAD_FIXTURES.bugSeenByOthers,
      toolOverrides: {
        searchThreads: async () => DEFAULT_BUG_THREAD_SEARCH_RESULTS,
      },
    },
    expected: {
      mustInclude: ["searchThreads", "setDraft"],
      mayAlsoInclude: ["searchDocumentation"],
    },
  },
  {
    input: {
      userMessage: "What should I do with this ticket?",
      thread: THREAD_FIXTURES.knownIssue,
      suggestionsContext: `
## Suggestions & Intelligence
The following suggestions have been automatically generated by our analysis system for this thread.
### Related Threads
These threads were identified as similar to the current thread based on content analysis. You can use the getThread tool with their _id to read their full conversation.
- "Webhook delivery delays" (_id: 01jnqxk5vg3mardze7tq0bn8yh, by John Davis, similarity: 85%)`,
    },
    expected: {
      mustInclude: ["getThread"],
      mayAlsoInclude: ["searchDocumentation"],
    },
  },
  {
    input: {
      userMessage: "Write a response explaining our refund policy",
      thread: THREAD_FIXTURES.refundRequest,
      toolOverrides: {
        searchDocumentation: async () => DEFAULT_BILLING_DOC_RESULTS,
      },
    },
    expected: {
      mustInclude: ["searchDocumentation", "setDraft"],
      mayAlsoInclude: [],
    },
  },
  {
    input: {
      userMessage: "Reply to this customer",
      thread: THREAD_FIXTURES.duplicateThread,
      suggestionsContext: `
## Suggestions & Intelligence
The following suggestions have been automatically generated by our analysis system for this thread.
### Possible Duplicate
This thread may be a duplicate of "Login page blank after deployment" (_id: 01jnqxkq2b8afshm6nqr0fwuve), confidence: high. Reason: Both report blank login page after recent changes.`,
      toolOverrides: {
        getThread: async () => DUPLICATE_GET_THREAD_RESULT,
      },
    },
    expected: {
      mustInclude: ["getThread", "setDraft"],
      mayAlsoInclude: ["searchDocumentation"],
    },
  },
];

// ─── Draft Quality Dataset ───────────────────────────────────────────────────

export const draftQualityDataset: DraftQualityTestCase[] = [
  {
    input: {
      userMessage: "Draft a reply to help this customer",
      thread: THREAD_FIXTURES.billingError,
      toolOverrides: {
        searchDocumentation: async () => DEFAULT_BILLING_DOC_RESULTS,
      },
    },
    expected:
      "The draft should acknowledge the duplicate charge, explain the refund process (3-5 business days), and ask for transaction ID or confirm the card details already provided. Professional and empathetic tone.",
  },
  {
    input: {
      userMessage: "Write a reply for this bug report",
      thread: THREAD_FIXTURES.technicalBug,
    },
    expected:
      "The draft should acknowledge the file upload crash, mention the specific error (RangeError), and either provide troubleshooting steps or confirm the team is investigating. Should ask for any additional details if needed.",
  },
  {
    input: {
      userMessage: "Draft a response to this feature request",
      thread: THREAD_FIXTURES.featureRequest,
    },
    expected:
      "The draft should thank the customer for the suggestion, acknowledge dark mode as a valid request, and provide information about whether it's being considered or how feature requests are tracked. Should not make promises about timelines.",
  },
  {
    input: {
      userMessage: "Help me draft a reply to de-escalate this situation",
      thread: THREAD_FIXTURES.angryCustomer,
    },
    expected:
      "The draft should be highly empathetic, acknowledge the customer's frustration and repeated contacts, apologize sincerely, and offer a concrete next step (escalation, direct contact, or specific troubleshooting). Should address the refund request. Must not be dismissive.",
  },
];

// ─── Thread Reference Formatting Dataset ─────────────────────────────────────

export const threadReferenceDataset: ThreadReferenceTestCase[] = [
  {
    input: {
      userMessage: "Search for similar issues to this one",
      thread: THREAD_FIXTURES.passwordReset,
    },
    expected: {
      threadIds: ["01jnqxk5vg3mardze7tq0bn8yh", "01jnqxk8rp4bfcw2ax9d6e3tyn"],
      threadNames: [
        "Password reset link expired immediately",
        "Cannot log in after password change",
      ],
    },
  },
  {
    input: {
      userMessage: "Find related bug reports",
      thread: THREAD_FIXTURES.bugSeenByOthers,
      toolOverrides: {
        searchThreads: async () => DEFAULT_BUG_THREAD_SEARCH_RESULTS,
      },
    },
    expected: {
      threadIds: ["01jnqxkbm7wstrjp5qnv0fhxkd", "01jnqxkdqz6yanwe8cr2g4mvpf"],
      threadNames: [
        "Search showing cross-workspace data",
        "Data leaking between workspaces in search",
      ],
    },
  },
  {
    input: {
      userMessage: "Are there any similar tickets?",
      thread: THREAD_FIXTURES.technicalBug,
      toolOverrides: {
        searchThreads: async () => DEFAULT_UPLOAD_BUG_THREAD_SEARCH_RESULTS,
      },
    },
    expected: {
      threadIds: ["01jnqxkrvw4ghmnp2bqt8fxdya", "01jnqxktwx5jknqr3csu9gyezb"],
      threadNames: [
        "File upload fails with large attachments",
        "App freezes during large CSV import",
      ],
    },
  },
];
