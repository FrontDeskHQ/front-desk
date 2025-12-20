import type { DemoThread } from "./types";

export const demoThreads: DemoThread[] = [
  {
    id: "th_1",
    title: "Billing portal redirects to a blank page",
    authorName: "Alex Chen",
    assignedUserName: "Pedro Costa",
    priority: 4,
    status: 1,
    labels: [
      { name: "Billing", color: "#60A5FA" },
      { name: "Bug", color: "#F87171" },
    ],
    lastMessage: {
      authorName: "Pedro Costa",
      content:
        "Thanks — I can reproduce this. Working on a fix now; I’ll follow up in ~30 minutes with an update.",
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 8),
  },
  {
    id: "th_2",
    title: "Discord integration: threads not syncing",
    authorName: "Maya Patel",
    assignedUserName: "Sam",
    priority: 3,
    status: 0,
    labels: [
      { name: "Discord", color: "#A78BFA" },
      { name: "Integrations", color: "#34D399" },
    ],
    lastMessage: {
      authorName: "Maya Patel",
      content:
        "We connected the bot but nothing appears in FrontDesk. Is there a permission we’re missing?",
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 42),
  },
  {
    id: "th_3",
    title: "How do I export all threads?",
    authorName: "Jordan Lee",
    priority: 2,
    status: 0,
    labels: [{ name: "Question", color: "#FBBF24" }],
    lastMessage: {
      authorName: "Jordan Lee",
      content:
        "We’d like a CSV export for weekly reporting. Is there an endpoint or a UI flow for this?",
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
  },
  {
    id: "th_4",
    title: "SSO: users get 'organization not found'",
    authorName: "Priya Singh",
    assignedUserName: "Taylor",
    priority: 4,
    status: 1,
    labels: [
      { name: "Auth", color: "#22C55E" },
      { name: "SSO", color: "#38BDF8" },
    ],
    lastMessage: {
      authorName: "Taylor",
      content:
        "Can you share the SSO callback URL + the org slug you’re using? I suspect a domain mismatch.",
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18),
  },
  {
    id: "th_5",
    title: "Feature request: assign threads automatically",
    authorName: "Chris Johnson",
    priority: 1,
    status: 2,
    labels: [
      { name: "Feature", color: "#FB7185" },
      { name: "Routing", color: "#94A3B8" },
    ],
    lastMessage: {
      authorName: "Chris Johnson",
      content:
        "This would save us a ton of time. Happy to chat about rules based on labels + channel.",
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
  },
  {
    id: "th_6",
    title: "Resolved: webhook signature validation",
    authorName: "Elena García",
    assignedUserName: "Pedro Costa",
    priority: 2,
    status: 3,
    labels: [
      { name: "API", color: "#60A5FA" },
      { name: "Security", color: "#F87171" },
    ],
    lastMessage: {
      authorName: "Elena García",
      content:
        "Confirmed — rotating the secret fixed it. Thanks for the quick help!",
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
  },
];


