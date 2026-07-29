import type {
  MockLabel,
  MockMessage,
  MockStatusSuggestion,
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

export const THREAD: MockThreadState = {
  assignedUserName: null,
  labels: [{ color: "var(--label-color-blue)", name: "Webhooks" }],
  priority: 2,
  shortId: 1842,
  status: 0,
  title: "Webhook stopped firing — orders not syncing",
};

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

/** SI quick suggestions for the open webhook thread (reply-mode toolbar). */
export const SUGGESTIONS = {
  statusSuggestion: {
    label: "Resolved",
    status: 2,
  } satisfies MockStatusSuggestion,
  suggestedLabels: [
    { color: "var(--label-color-red)", name: "Bug" },
  ] satisfies MockLabel[],
};

/** Markdown draft shown in Support Intelligence → Draft Reply. */
export const SI_DRAFT = `Thanks for flagging! That usually means your signing secret rotated. Here's how to update it and replay the missed events: [docs.acme.co/webhooks/signing-secret](https://docs.acme.co/webhooks/signing-secret)`;

/** TipTap JSON draft for the reply composer (reply mode). */
export const REPLY_DRAFT = paragraphWithLink(
  "Thanks for flagging! That usually means your signing secret rotated. Here's how to update it and replay the missed events: ",
  "docs.acme.co/webhooks/signing-secret",
  "https://docs.acme.co/webhooks/signing-secret"
);

/** Chat transcript under the SI draft — search then draft. */
export const SI_MESSAGES = [
  {
    content: "Draft a reply for this webhook issue.",
    id: "si-user-1",
    role: "user" as const,
  },
  {
    content:
      "Signing secret rotation is the usual cause here. I pulled the docs and drafted a reply you can send.",
    id: "si-assistant-1",
    role: "assistant" as const,
    toolCalls: [
      { displayName: "Searched documentation", name: "searchDocumentation" },
      { displayName: "Drafted a reply", name: "setDraft" },
    ],
  },
];
