import type { DemoThread } from "./types";

const NOW = Date.now();

const min = (n: number) => new Date(NOW - 1000 * 60 * n);
const hr = (n: number) => new Date(NOW - 1000 * 60 * 60 * n);
const day = (n: number) => new Date(NOW - 1000 * 60 * 60 * 24 * n);

/** Shared fixture inbox — busy open list for marketing mirrors. */
export const demoThreads: DemoThread[] = [
  {
    assignedUserName: "Pedro Costa",
    authorName: "Alex Chen",
    createdAt: min(8),
    id: "th_1",
    labels: [
      { name: "Billing", color: "var(--label-color-blue)" },
      { name: "Bug", color: "var(--label-color-red)" },
    ],
    lastMessage: {
      authorName: "Alex Chen",
      content:
        "I'm unable to access the billing portal. It redirects to a blank page.",
    },
    priority: 4,
    shortId: 1847,
    status: 1,
    title: "Billing portal redirects to a blank page",
  },
  {
    assignedUserName: "Daniel Moura",
    authorName: "Maya Patel",
    createdAt: min(42),
    id: "th_2",
    labels: [
      { name: "Discord", color: "var(--label-color-purple)" },
      { name: "Integrations", color: "var(--label-color-green)" },
    ],
    lastMessage: {
      authorName: "Maya Patel",
      content:
        "We connected the bot but nothing appears in FrontDesk. Is there a permission we're missing?",
    },
    priority: 3,
    shortId: 1846,
    status: 0,
    title: "Discord integration: threads not syncing",
  },
  {
    authorName: "Sam Okonkwo",
    createdAt: min(55),
    id: "th_3",
    labels: [
      { name: "Slack", color: "var(--label-color-teal)" },
      { name: "Urgent", color: "var(--label-color-red)" },
    ],
    lastMessage: {
      authorName: "Sam Okonkwo",
      content:
        "Customers in #support are waiting — the agent replied once and went quiet.",
    },
    priority: 4,
    shortId: 1845,
    status: 0,
    title: "Agent stopped mid-thread in #support",
  },
  {
    authorName: "Jordan Lee",
    createdAt: hr(2),
    id: "th_4",
    labels: [{ name: "Question", color: "var(--label-color-yellow)" }],
    lastMessage: {
      authorName: "Jordan Lee",
      content:
        "We'd like a CSV export for weekly reporting. Is there an endpoint or a UI flow for this?",
    },
    priority: 2,
    shortId: 1844,
    status: 0,
    title: "How do I export all threads?",
  },
  {
    assignedUserName: "Taylor Kim",
    authorName: "Priya Singh",
    createdAt: hr(5),
    id: "th_5",
    labels: [
      { name: "Auth", color: "var(--label-color-green)" },
      { name: "SSO", color: "var(--label-color-blue)" },
    ],
    lastMessage: {
      authorName: "Taylor Kim",
      content:
        "Can you share the SSO callback URL + the org slug you're using? I suspect a domain mismatch.",
    },
    priority: 4,
    shortId: 1843,
    status: 1,
    title: "SSO: users get 'organization not found'",
  },
  {
    authorName: "Riley Brooks",
    createdAt: hr(7),
    id: "th_6",
    labels: [
      { name: "GitHub", color: "var(--label-color-orange)" },
      { name: "Linked PR", color: "var(--label-color-purple)" },
    ],
    lastMessage: {
      authorName: "Riley Brooks",
      content:
        "Opened a PR that should close this — can FrontDesk pick it up from the issue link?",
    },
    priority: 2,
    shortId: 1842,
    status: 0,
    title: "Link GitHub PR to this thread automatically?",
  },
  {
    assignedUserName: "Pedro Costa",
    authorName: "Chris Nguyen",
    createdAt: hr(11),
    id: "th_7",
    labels: [
      { name: "Email", color: "var(--label-color-teal)" },
      { name: "Routing", color: "var(--label-color-blue)" },
    ],
    lastMessage: {
      authorName: "Chris Nguyen",
      content:
        "Replies from support@ are landing in spam for two customers on Outlook.",
    },
    priority: 3,
    shortId: 1841,
    status: 1,
    title: "Outbound email hitting spam filters",
  },
  {
    authorName: "Aisha Rahman",
    createdAt: hr(18),
    id: "th_8",
    labels: [
      { name: "API", color: "var(--label-color-blue)" },
      { name: "Rate limit", color: "var(--label-color-orange)" },
    ],
    lastMessage: {
      authorName: "Aisha Rahman",
      content:
        "Hitting 429s on /threads after ~200 req/min. Is there a higher tier?",
    },
    priority: 3,
    shortId: 1840,
    status: 0,
    title: "API rate limit during bulk sync",
  },
  {
    authorName: "Chris Johnson",
    createdAt: day(1),
    id: "th_9",
    labels: [
      { name: "Feature", color: "var(--label-color-pink)" },
      { name: "Routing", color: "var(--label-color-teal)" },
    ],
    lastMessage: {
      authorName: "Chris Johnson",
      content:
        "This would save us a ton of time. Happy to chat about rules based on labels + channel.",
    },
    priority: 1,
    shortId: 1839,
    status: 2,
    title: "Feature request: assign threads automatically",
  },
  {
    assignedUserName: "Daniel Moura",
    authorName: "Noah Berg",
    createdAt: day(1),
    id: "th_10",
    labels: [
      { name: "Slack", color: "var(--label-color-teal)" },
      { name: "Permissions", color: "var(--label-color-yellow)" },
    ],
    lastMessage: {
      authorName: "Daniel Moura",
      content:
        "Bot needs channels:history on private channels — documenting the required scopes now.",
    },
    priority: 2,
    shortId: 1838,
    status: 1,
    title: "Can't see messages in private Slack channels",
  },
  {
    authorName: "Elena García",
    createdAt: day(2),
    id: "th_11",
    labels: [
      { name: "Portal", color: "var(--label-color-purple)" },
      { name: "Branding", color: "var(--label-color-pink)" },
    ],
    lastMessage: {
      authorName: "Elena García",
      content:
        "Custom logo uploads fine, but the favicon still shows the FrontDesk mark.",
    },
    priority: 1,
    shortId: 1837,
    status: 0,
    title: "Portal favicon not updating after upload",
  },
  {
    assignedUserName: "Taylor Kim",
    authorName: "Marcus Webb",
    createdAt: day(2),
    id: "th_12",
    labels: [
      { name: "Discord", color: "var(--label-color-purple)" },
      { name: "Bug", color: "var(--label-color-red)" },
    ],
    lastMessage: {
      authorName: "Marcus Webb",
      content:
        "Forum posts create threads, but replies in the same post don't show up.",
    },
    priority: 3,
    shortId: 1836,
    status: 1,
    title: "Discord forum replies missing from inbox",
  },
  {
    authorName: "Hannah Cho",
    createdAt: day(3),
    id: "th_13",
    labels: [
      { name: "Billing", color: "var(--label-color-blue)" },
      { name: "Question", color: "var(--label-color-yellow)" },
    ],
    lastMessage: {
      authorName: "Hannah Cho",
      content:
        "We're on annual — can we add two seats mid-cycle without changing the renewal date?",
    },
    priority: 2,
    shortId: 1835,
    status: 0,
    title: "Prorated seats on annual plan?",
  },
  {
    assignedUserName: "Pedro Costa",
    authorName: "Devin Ortiz",
    createdAt: day(3),
    id: "th_14",
    labels: [
      { name: "GitHub", color: "var(--label-color-orange)" },
      { name: "Webhook", color: "var(--label-color-red)" },
    ],
    lastMessage: {
      authorName: "Pedro Costa",
      content:
        "Delivery logs show 401s after the org rotated the GitHub App secret overnight.",
    },
    priority: 4,
    shortId: 1834,
    status: 1,
    title: "GitHub webhooks failing after secret rotation",
  },
  {
    authorName: "Sofia Mendes",
    createdAt: day(4),
    id: "th_15",
    labels: [
      { name: "Email", color: "var(--label-color-teal)" },
      { name: "Onboarding", color: "var(--label-color-green)" },
    ],
    lastMessage: {
      authorName: "Sofia Mendes",
      content:
        "Forwarding is set up — first message arrived, but the customer never got the auto-ack.",
    },
    priority: 2,
    shortId: 1833,
    status: 0,
    title: "Auto-ack missing on forwarded support email",
  },
  {
    authorName: "Leo Park",
    createdAt: day(5),
    id: "th_16",
    labels: [
      { name: "Labels", color: "var(--label-color-pink)" },
      { name: "AI", color: "var(--label-color-purple)" },
    ],
    lastMessage: {
      authorName: "Leo Park",
      content:
        "Churn-risk keeps firing on billing questions that aren't actually at-risk accounts.",
    },
    priority: 2,
    shortId: 1832,
    status: 0,
    title: "False positive 'Churn risk' labels",
  },
  {
    assignedUserName: "Daniel Moura",
    authorName: "Yuki Tanaka",
    createdAt: day(6),
    id: "th_17",
    labels: [
      { name: "Slack", color: "var(--label-color-teal)" },
      { name: "Performance", color: "var(--label-color-orange)" },
    ],
    lastMessage: {
      authorName: "Yuki Tanaka",
      content:
        "Inbox takes ~8s to load when we have 2k+ open threads. Anything we can do on our side?",
    },
    priority: 3,
    shortId: 1831,
    status: 1,
    title: "Slow inbox load with large thread volume",
  },
  {
    assignedUserName: "Pedro Costa",
    authorName: "Elena García",
    createdAt: day(7),
    id: "th_18",
    labels: [
      { name: "API", color: "var(--label-color-blue)" },
      { name: "Security", color: "var(--label-color-red)" },
    ],
    lastMessage: {
      authorName: "Elena García",
      content:
        "Confirmed — rotating the secret fixed it. Thanks for the quick help!",
    },
    priority: 2,
    shortId: 1830,
    status: 3,
    title: "Resolved: webhook signature validation",
  },
];
