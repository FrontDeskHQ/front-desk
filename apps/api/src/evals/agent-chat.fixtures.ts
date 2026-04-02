import type {
  AgentChatToolImplementations,
  SearchDocumentationResult,
  SearchThreadsResult,
  GetThreadResult,
  ListThreadsResult,
} from "../live-state/router/agent-chat-core";

// ─── Thread Context Fixtures ─────────────────────────────────────────────────

export interface ThreadFixture {
  name: string;
  author: string;
  status: string;
  priority: string;
  assignee: string | null;
  labels: string[];
  messages: Array<{ author: string; content: string }>;
}

export const THREAD_FIXTURES: Record<string, ThreadFixture> = {
  passwordReset: {
    name: "Can't reset my password",
    author: "Sarah Chen",
    status: "Open",
    priority: "High",
    assignee: null,
    labels: ["account"],
    messages: [
      {
        author: "Sarah Chen",
        content:
          "I've been trying to reset my password for the last hour. I click the reset link in the email but it says the token has expired. I've tried 5 times now. This is really frustrating, I need to access my account urgently for a presentation tomorrow.",
      },
      {
        author: "Sarah Chen",
        content:
          "I also tried the 'Forgot Password' flow from the login page and it just sends me back to the same expired link.",
      },
    ],
  },
  billingError: {
    name: "Charged twice for subscription",
    author: "Marcus Johnson",
    status: "Open",
    priority: "Urgent",
    assignee: "Alex Rivera",
    labels: ["billing", "urgent"],
    messages: [
      {
        author: "Marcus Johnson",
        content:
          "I was charged $49.99 twice on my credit card this month for my Pro subscription. The charges are dated March 1st and March 15th. My subscription is supposed to renew on the 1st of each month. Please refund the duplicate charge.",
      },
      {
        author: "Alex Rivera",
        content:
          "Hi Marcus, I'm looking into this for you. Can you confirm the last 4 digits of the card that was charged?",
      },
      {
        author: "Marcus Johnson",
        content: "It ends in 4242.",
      },
    ],
  },
  technicalBug: {
    name: "App crashes when uploading large files",
    author: "Emily Park",
    status: "Open",
    priority: "High",
    assignee: null,
    labels: ["bug"],
    messages: [
      {
        author: "Emily Park",
        content:
          "Every time I try to upload a file larger than 50MB, the app crashes with a white screen. I'm on Chrome 120 on macOS. The console shows 'RangeError: Maximum call stack size exceeded'. This started happening after the last update.",
      },
    ],
  },
  featureRequest: {
    name: "Request: Dark mode support",
    author: "Jordan Lee",
    status: "Open",
    priority: "Low",
    assignee: null,
    labels: ["feature-request"],
    messages: [
      {
        author: "Jordan Lee",
        content:
          "It would be great if the app supported dark mode. I often work late at night and the bright white interface is hard on my eyes. Many other apps in this space already support it.",
      },
    ],
  },
  angryCustomer: {
    name: "SERVICE IS TERRIBLE - WANT REFUND",
    author: "Robert Williams",
    status: "Open",
    priority: "Urgent",
    assignee: null,
    labels: ["billing", "escalation"],
    messages: [
      {
        author: "Robert Williams",
        content:
          "This is the THIRD time I'm reaching out about the same issue. Your product keeps logging me out every 5 minutes. I can't get any work done. I've wasted hours on this. I want a full refund and I'm canceling my subscription. Your support team keeps giving me the same useless troubleshooting steps that don't work.",
      },
    ],
  },
  bugSeenByOthers: {
    name: "Search results returning wrong data",
    author: "Diana Torres",
    status: "Open",
    priority: "High",
    assignee: null,
    labels: ["bug"],
    messages: [
      {
        author: "Diana Torres",
        content:
          "When I search for projects in the dashboard, the results show data from a completely different workspace. I'm seeing other users' project names and descriptions. This seems like a serious data isolation issue.",
      },
    ],
  },
  knownIssue: {
    name: "Webhooks not firing for new events",
    author: "Kevin Nguyen",
    status: "Open",
    priority: "Medium",
    assignee: null,
    labels: ["integration"],
    messages: [
      {
        author: "Kevin Nguyen",
        content:
          "Our webhook endpoint stopped receiving events since yesterday around 3pm EST. We rely on these webhooks for our Slack integration. The webhook URL is correct and our server is healthy - I can see it responding to manual pings.",
      },
    ],
  },
  refundRequest: {
    name: "Requesting refund for annual plan",
    author: "Lisa Patel",
    status: "Open",
    priority: "Medium",
    assignee: null,
    labels: ["billing"],
    messages: [
      {
        author: "Lisa Patel",
        content:
          "I purchased the annual plan last week but realized the product doesn't support the integrations I need (specifically Salesforce and HubSpot). I'd like to request a full refund as per your refund policy.",
      },
    ],
  },
  duplicateThread: {
    name: "Login page shows blank screen",
    author: "Mike Chen",
    status: "Open",
    priority: "High",
    assignee: null,
    labels: ["bug"],
    messages: [
      {
        author: "Mike Chen",
        content:
          "After the latest deployment, the login page just shows a white screen. No errors in the console. Happening on both Chrome and Firefox.",
      },
    ],
  },
};

// ─── Mock Tool Responses ─────────────────────────────────────────────────────

const DEFAULT_DOC_RESULTS: SearchDocumentationResult[] = [
  {
    title: "Password Reset Guide",
    url: "https://docs.example.com/account/password-reset",
    content:
      "To reset your password: 1. Go to Settings > Security > Change Password. 2. Click 'Reset Password'. 3. Check your email for a reset link (valid for 30 minutes). 4. If the link expires, request a new one. Common issues: Reset links expire after 30 minutes. If you're having trouble, try clearing your browser cache or using an incognito window. If the issue persists, contact support to manually reset your account.",
    section: "Account > Security > Password Reset",
  },
  {
    title: "Account Recovery",
    url: "https://docs.example.com/account/recovery",
    content:
      "If you cannot access your account: 1. Try the 'Forgot Password' flow on the login page. 2. If email-based recovery doesn't work, contact support with your account email and a government-issued ID for manual verification. 3. Recovery typically takes 1-2 business days for manual verification.",
    section: "Account > Recovery",
  },
];

const DEFAULT_BILLING_DOC_RESULTS: SearchDocumentationResult[] = [
  {
    title: "Billing & Refund Policy",
    url: "https://docs.example.com/billing/refunds",
    content:
      "Refund Policy: We offer full refunds within 14 days of purchase for annual plans and 7 days for monthly plans. To request a refund, contact support with your account email and the reason for the refund. Duplicate charges are automatically refunded within 3-5 business days once verified. For billing disputes, provide the transaction ID and last 4 digits of the payment method.",
    section: "Billing > Refunds",
  },
  {
    title: "Subscription Management",
    url: "https://docs.example.com/billing/subscription",
    content:
      "To manage your subscription: Go to Settings > Billing. You can upgrade, downgrade, or cancel at any time. Cancellations take effect at the end of the current billing period. Pro plan: $49.99/month or $499.99/year. Enterprise plan: Custom pricing.",
    section: "Billing > Subscription",
  },
];

const DEFAULT_THREAD_SEARCH_RESULTS: SearchThreadsResult[] = [
  {
    _id: "01jnqxk5vg3mardze7tq0bn8yh",
    name: "Password reset link expired immediately",
    status: "Resolved",
    priority: "Medium",
    author: "John Davis",
    createdAt: "2026-03-15T09:00:00Z",
    matchingMessageSnippet:
      "My password reset link expires before I can click it. Turns out my system clock was 2 hours ahead...",
    score: 0.87,
  },
  {
    _id: "01jnqxk8rp4bfcw2ax9d6e3tyn",
    name: "Cannot log in after password change",
    status: "Resolved",
    priority: "High",
    author: "Amy Liu",
    createdAt: "2026-03-10T14:00:00Z",
    matchingMessageSnippet:
      "After changing my password, I keep getting 'invalid credentials'. Had to clear cookies and it worked.",
    score: 0.72,
  },
];

const DEFAULT_BUG_THREAD_SEARCH_RESULTS: SearchThreadsResult[] = [
  {
    _id: "01jnqxkbm7wstrjp5qnv0fhxkd",
    name: "Search showing cross-workspace data",
    status: "In Progress",
    priority: "Urgent",
    author: "Support Team",
    createdAt: "2026-03-20T11:00:00Z",
    matchingMessageSnippet:
      "We've identified a data isolation bug affecting search results. Engineering is working on a fix...",
    score: 0.92,
  },
  {
    _id: "01jnqxkdqz6yanwe8cr2g4mvpf",
    name: "Data leaking between workspaces in search",
    status: "Open",
    priority: "High",
    author: "Carlos Mendes",
    createdAt: "2026-03-22T08:30:00Z",
    matchingMessageSnippet:
      "I can see projects from other teams in my search results. This is a security concern...",
    score: 0.85,
  },
];

const DEFAULT_UPLOAD_BUG_THREAD_SEARCH_RESULTS: SearchThreadsResult[] = [
  {
    _id: "01jnqxkrvw4ghmnp2bqt8fxdya",
    name: "File upload fails with large attachments",
    status: "Resolved",
    priority: "High",
    author: "Tom Baker",
    createdAt: "2026-03-18T10:00:00Z",
    matchingMessageSnippet:
      "Uploading files over 50MB causes the app to crash with a stack overflow. The chunked upload fix in v2.3.2 resolved it.",
    score: 0.91,
  },
  {
    _id: "01jnqxktwx5jknqr3csu9gyezb",
    name: "App freezes during large CSV import",
    status: "In Progress",
    priority: "Medium",
    author: "Rachel Kim",
    createdAt: "2026-03-21T15:30:00Z",
    matchingMessageSnippet:
      "Importing CSV files larger than 40MB causes the browser tab to become unresponsive. Same RangeError in console.",
    score: 0.78,
  },
];

const DEFAULT_LIST_THREADS_RESULTS: ListThreadsResult[] = [
  {
    _id: "01jnqxkgth9xbpej3kmn7csqra",
    name: "App crashes on iOS 18",
    status: "Open",
    priority: "Urgent",
    author: "Alice Thompson",
    assignee: null,
    createdAt: "2026-03-24T08:00:00Z",
    externalOrigin: null,
  },
  {
    _id: "01jnqxkjwv2ydqfk4lnp8dtrsc",
    name: "Billing discrepancy for Enterprise plan",
    status: "Open",
    priority: "High",
    author: "Charlie Brown",
    assignee: "Finance Team",
    createdAt: "2026-03-23T16:00:00Z",
    externalOrigin: null,
  },
  {
    _id: "01jnqxkmzy5zergl5mpq9evstd",
    name: "Feature request: API rate limit dashboard",
    status: "Open",
    priority: "Low",
    author: "Priya Sharma",
    assignee: null,
    createdAt: "2026-03-23T10:00:00Z",
    externalOrigin: "discord",
  },
];

const DEFAULT_GET_THREAD_RESULT: GetThreadResult = {
  _id: "01jnqxk5vg3mardze7tq0bn8yh",
  name: "Password reset link expired immediately",
  status: "Resolved",
  priority: "Medium",
  author: "John Davis",
  assignee: "Support Agent",
  labels: ["account", "resolved"],
  createdAt: "2026-03-15T09:00:00Z",
  externalOrigin: null,
  messageCount: 4,
  messages: [
    {
      author: "John Davis",
      content:
        "My password reset link expires immediately when I click it. I've tried multiple times.",
      createdAt: "2026-03-15T09:00:00Z",
    },
    {
      author: "Support Agent",
      content:
        "Can you check if your system clock is set correctly? Sometimes expired tokens are caused by clock drift.",
      createdAt: "2026-03-15T09:15:00Z",
    },
    {
      author: "John Davis",
      content:
        "You were right! My system clock was 2 hours ahead. Fixed it and the reset link works now.",
      createdAt: "2026-03-15T09:30:00Z",
    },
    {
      author: "Support Agent",
      content:
        "Glad that fixed it! Marking this as resolved. If you have any other issues, don't hesitate to reach out.",
      createdAt: "2026-03-15T09:35:00Z",
    },
  ],
};

const DUPLICATE_GET_THREAD_RESULT: GetThreadResult = {
  _id: "01jnqxkq2b8afshm6nqr0fwuve",
  name: "Login page blank after deployment",
  status: "In Progress",
  priority: "Urgent",
  author: "DevOps Team",
  assignee: "Engineering",
  labels: ["bug", "deployment"],
  createdAt: "2026-03-23T18:00:00Z",
  externalOrigin: null,
  messageCount: 3,
  messages: [
    {
      author: "DevOps Team",
      content:
        "After deploying v2.4.1, the login page shows a blank white screen. Rolling back to v2.4.0 fixes it. The issue is in the new auth module initialization.",
      createdAt: "2026-03-23T18:00:00Z",
    },
    {
      author: "Engineering",
      content:
        "Found the root cause - the new OAuth config is missing a required redirect URI in production. Fix is being deployed now.",
      createdAt: "2026-03-23T19:00:00Z",
    },
    {
      author: "DevOps Team",
      content: "Fix deployed. Login page is back. Monitoring for any regressions.",
      createdAt: "2026-03-23T20:00:00Z",
    },
  ],
};

// ─── Mock Tool Factory ───────────────────────────────────────────────────────

export function createMockToolImplementations(
  overrides?: Partial<AgentChatToolImplementations>,
): AgentChatToolImplementations {
  return {
    searchDocumentation: async () => DEFAULT_DOC_RESULTS,
    getDraft: async () => ({ hasDraft: false, content: null }),
    setDraft: async () => ({ success: true }),
    searchThreads: async () => DEFAULT_THREAD_SEARCH_RESULTS,
    getThread: async () => DEFAULT_GET_THREAD_RESULT,
    listThreads: async () => DEFAULT_LIST_THREADS_RESULTS,
    ...overrides,
  };
}

export {
  DEFAULT_DOC_RESULTS,
  DEFAULT_BILLING_DOC_RESULTS,
  DEFAULT_THREAD_SEARCH_RESULTS,
  DEFAULT_BUG_THREAD_SEARCH_RESULTS,
  DEFAULT_UPLOAD_BUG_THREAD_SEARCH_RESULTS,
  DEFAULT_LIST_THREADS_RESULTS,
  DEFAULT_GET_THREAD_RESULT,
  DUPLICATE_GET_THREAD_RESULT,
};
