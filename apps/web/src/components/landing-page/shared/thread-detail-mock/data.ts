import type { MockMessage, MockThreadState } from "./types";

const NOW = Date.now();

/** TipTap JSON body — the encoding every mock message content uses. */
export function paragraph(text: string): string {
  return JSON.stringify([
    {
      content: [{ text, type: "text" }],
      type: "paragraph",
    },
  ]);
}

export function paragraphWithLink(
  before: string,
  label: string,
  href: string
): string {
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
      "Thanks for reporting this. If your signing secret rotated recently, your endpoint needs the new value before deliveries resume. Here's how to update it and replay missed events: ",
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
      "our webhook stopped delivering sometime this morning — orders aren't syncing to our store anymore"
    ),
    createdAt: new Date(NOW - 1000 * 60 * 4),
    id: "msg-customer",
    markedAsAnswer: false,
  },
  human: {
    author: { name: "Pedro" },
    content: paragraph(
      "checking your endpoint's delivery logs now — i'll update you shortly"
    ),
    createdAt: new Date(NOW - 1000 * 30),
    id: "msg-human",
    markedAsAnswer: false,
  },
  pushback: {
    author: { name: "Jordan Chen" },
    content: paragraph(
      "updated the secret per the doc, still nothing. got ~40 orders sitting in limbo"
    ),
    createdAt: new Date(NOW - 1000 * 60 * 2),
    id: "msg-pushback",
    markedAsAnswer: false,
  },
} as const satisfies Record<string, MockMessage>;
