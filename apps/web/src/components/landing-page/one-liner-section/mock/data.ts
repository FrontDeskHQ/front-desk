import { MESSAGES, THREAD } from "../../shared/thread-detail-mock";
import type { MockSignalCardData, MockThreadState } from "./types";

export {
  MESSAGES,
  THREAD,
} from "../../shared/thread-detail-mock";
export type {
  MockLabel,
  MockMessage,
  MockThreadState,
} from "../../shared/thread-detail-mock";

export const ORG = {
  name: "Acme",
} as const;

export const VIEWER = {
  firstName: "Pedro",
  name: "Pedro",
} as const;

export const CHURN_LABEL = {
  color: "var(--label-color-red)",
  name: "Churn risk",
} as const;

const SIGNAL_CREATED_AT = new Date();

export const SIGNAL: MockSignalCardData = {
  authorName: MESSAGES.customer.author.name,
  createdAt: SIGNAL_CREATED_AT,
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
