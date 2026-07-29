import type {
  MockMessage,
  MockSignalCardData,
  MockThreadState,
} from "./types";

const NOW = Date.now();

function paragraph(text: string): string {
  return JSON.stringify([
    {
      content: [{ text, type: "text" }],
      type: "paragraph",
    },
  ]);
}

function paragraphWithLink(before: string, label: string, href: string): string {
  return JSON.stringify([
    {
      content: [
        { text: before, type: "text" },
        {
          marks: [{ attrs: { href }, type: "link" }],
          text: label,
          type: "text",
        },
      ],
      type: "paragraph",
    },
  ]);
}

export const ORG = {
  name: "Acme",
} as const;

export const VIEWER = {
  firstName: "Pedro",
  name: "Pedro",
} as const;

export const THREAD: MockThreadState = {
  assignedUserName: null,
  labels: [{ color: "var(--label-color-blue)", name: "Webhooks" }],
  priority: 2,
  shortId: 1842,
  status: 0,
  title: "Webhook stopped firing — orders not syncing",
};

export const CHURN_LABEL = {
  color: "var(--label-color-red)",
  name: "Churn risk",
} as const;

export const MESSAGES = {
  agent: {
    author: { name: "Pedro" },
    content: paragraphWithLink(
      "Thanks for flagging! That usually means your signing secret rotated. Here's how to update it and replay the missed events: ",
      "docs.acme.co/webhooks/signing-secret",
      "https://docs.acme.co/webhooks/signing-secret"
    ),
    createdAt: new Date(NOW - 1000 * 60 * 3),
    id: "msg-agent",
    markedAsAnswer: false,
  },
  customer: {
    author: { name: "Jordan Chen" },
    content: paragraph(
      "Hey — our webhook stopped firing this morning and orders aren't syncing."
    ),
    createdAt: new Date(NOW - 1000 * 60 * 4),
    id: "msg-customer",
    markedAsAnswer: false,
  },
  human: {
    author: { name: "Pedro" },
    content: paragraph(
      "Got it — this needs a closer look. Digging into the webhook logs now; I'll follow up shortly."
    ),
    createdAt: new Date(NOW - 1000 * 30),
    id: "msg-human",
    markedAsAnswer: false,
  },
  pushback: {
    author: { name: "Jordan Chen" },
    content: paragraph(
      "Tried that — still nothing, and orders are piling up. If this isn't fixed today we'll have to move off the product."
    ),
    createdAt: new Date(NOW - 1000 * 60 * 2),
    id: "msg-pushback",
    markedAsAnswer: false,
  },
} as const satisfies Record<string, MockMessage>;

export const SIGNAL: MockSignalCardData = {
  authorName: MESSAGES.customer.author.name,
  createdAt: new Date(NOW),
  recommendation:
    "Take this one — reply personally and dig into the webhook logs.",
  shortId: THREAD.shortId,
  summary:
    "Jordan tried the signing-secret fix — still nothing. Orders are piling up; they'll leave if this isn't fixed today.",
  title: THREAD.title,
  urgencyScore: 92,
};

/** Derive thread chrome that changes across the hero phase script. */
export function threadStateForPhase(phase: number): MockThreadState {
  return {
    ...THREAD,
    assignedUserName: phase >= 6 ? VIEWER.name : null,
    labels:
      phase >= 5 ? [...THREAD.labels, CHURN_LABEL] : [...THREAD.labels],
    priority: phase >= 5 ? 3 : 2,
    status: phase >= 6 ? 1 : 0,
  };
}
