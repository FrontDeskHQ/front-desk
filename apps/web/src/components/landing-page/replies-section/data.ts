import { paragraph } from "../shared/thread-detail-mock";
import type {
  MockMessage,
  MockThreadState,
} from "../shared/thread-detail-mock";

const NOW = Date.now();

/** Billing refund how-to, distinct from the hero webhook thread. */
export const THREAD: MockThreadState = {
  assignedUserName: "Pedro",
  labels: [
    { color: "var(--label-color-blue)", name: "Billing" },
    { color: "var(--label-color-yellow)", name: "Question" },
  ],
  priority: 2,
  shortId: 1831,
  status: 1,
  title: "Refund for double charge on March invoice",
};

export const CUSTOMER_MESSAGE: MockMessage = {
  author: { name: "Alex Rivera" },
  content: paragraph(
    "Hey, we got charged twice on our March invoice (INV-2041 and INV-2041-R). Can you refund the duplicate?"
  ),
  createdAt: new Date(NOW - 1000 * 60 * 12),
  id: "msg-refund-customer",
  markedAsAnswer: false,
};

export const READ_SUMMARY =
  "Duplicate March invoice charge. INV-2041-R is a rebill of INV-2041.";

export const READ_RECOMMENDATION =
  "Confirm the refund and point them at the invoice in billing docs.";

export const READ_DRAFT = `Got it. INV-2041-R is a duplicate of INV-2041, so I refunded the $240 to the card on file. Should show up in 3-5 business days.

You can track it under [Billing > Invoices](https://docs.acme.co/billing/invoices). Let me know if it doesn't land.`;
