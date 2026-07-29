import type { MockSignalCardData } from "../../shared/signals-mock";
import { MESSAGES, THREAD } from "../../shared/thread-detail-mock";
import type { MockThreadState } from "../../shared/thread-detail-mock";

export const VIEWER = {
  name: "Pedro",
} as const;

export const CHURN_LABEL = {
  color: "var(--label-color-red)",
  name: "Churn risk",
} as const;

const SIGNAL_CREATED_AT = new Date();

/** The single read the hero pops in on phase 03. */
export const HERO_SIGNALS: MockSignalCardData[] = [
  {
    authorName: MESSAGES.customer.author.name,
    createdAt: SIGNAL_CREATED_AT,
    id: "sig-hero-webhook",
    primaryKinds: ["reply"],
    recommendation:
      "Take this one — reply personally and dig into the webhook logs.",
    shortId: THREAD.shortId,
    summary:
      "Jordan tried the signing-secret fix — still nothing. Orders are piling up; they'll leave if this isn't fixed today.",
    title: THREAD.title,
    urgencyScore: 92,
  },
];

/** Derive thread chrome that changes across the hero phase script. */
export function threadStateForPhase(phase: number): MockThreadState {
  return {
    ...THREAD,
    assignedUserName: phase >= 6 ? VIEWER.name : null,
    labels: phase >= 5 ? [...THREAD.labels, CHURN_LABEL] : [...THREAD.labels],
    priority: phase >= 5 ? 3 : 2,
    status: phase >= 6 ? 1 : 0,
  };
}
