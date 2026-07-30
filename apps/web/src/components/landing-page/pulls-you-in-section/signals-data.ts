import type {
  MockSignalCardData,
  MockThreadReference,
} from "../shared/signals-mock";

const NOW = Date.now();

/** Threads referenced in signal recommendations — keyed by synthesis targetThreadId. */
export const THREAD_REFERENCES: Record<string, MockThreadReference> = {
  "t-rate-118": {
    assignedUser: { name: "Pedro" },
    assignedUserId: "u-pedro",
    author: { name: "Alex Rivera" },
    createdAt: new Date(NOW - 1000 * 60 * 60 * 48),
    id: "t-rate-118",
    name: "API rate limit increase",
    priority: 2,
    shortId: 1187,
    status: 1,
  },
};

export const VIEWER = {
  name: "Pedro",
} as const;

/** Mixed-urgency signals feed — copy follows synthesis agent summary/recommendation rules. */
export const SIGNALS: MockSignalCardData[] = [
  {
    alternativeKinds: [],
    authorName: "Jordan Chen",
    createdAt: new Date(NOW - 1000 * 60 * 4),
    id: "sig-webhook",
    primaryKinds: ["reply"],
    recommendation:
      "Reply with an update on the webhook investigation and what you are checking next.",
    shortId: 1842,
    summary:
      "Customer updated the webhook signing secret per the guide but deliveries still have not resumed and orders are not syncing.",
    title: "Webhook stopped firing — orders not syncing",
    urgencyScore: 92,
  },
  {
    alternativeKinds: ["close"],
    authorName: "Sam Okonkwo",
    createdAt: new Date(NOW - 1000 * 60 * 18),
    id: "sig-duplicate",
    primaryKinds: ["mark_duplicate", "reply"],
    recommendation:
      "This is a duplicate of [API rate limit increase](thread:t-rate-118).",
    shortId: 1903,
    summary:
      "Customer is requesting an increase in API rate limits due to their application constantly hitting the current limits.",
    title: "Need higher API rate limits for production",
    urgencyScore: 72,
  },
  {
    alternativeKinds: ["reply"],
    authorName: "Priya Patel",
    createdAt: new Date(NOW - 1000 * 60 * 55),
    id: "sig-close",
    primaryKinds: ["close"],
    recommendation:
      "Close the thread — the customer confirmed the issue is resolved.",
    shortId: 1756,
    summary:
      "Customer confirmed that SSO sign-in is working after following the setup guide.",
    title: "SSO setup not redirecting after login",
    urgencyScore: 12,
  },
];
