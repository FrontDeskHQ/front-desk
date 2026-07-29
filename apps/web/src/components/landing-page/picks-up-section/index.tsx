/**
 * 01 — Picks up every conversation.
 */

import { NarrativeSection } from "../shared/narrative-section";
import type { NarrativeTopic } from "../shared/narrative-section";

import { ThreadsListVisual } from "./threads-list-visual";

const TOPICS: readonly NarrativeTopic[] = [
  {
    lead: "Where your customers already are.",
    body: "Native to Slack, Discord, email, and GitHub — not another portal to check.",
  },
  {
    lead: "Triaged the moment it lands.",
    body: "24/7. Nothing waits for office hours.",
  },
  {
    lead: "Nothing slips.",
    body: "Every thread is seen, tagged, and tracked — even when no one's watching.",
  },
  {
    lead: "Context from the first word.",
    body: "Knows the customer's history and past threads before it responds.",
  },
];

export function PicksUpSection() {
  return (
    <NarrativeSection
      id="picks-up"
      title="Picks up every conversation."
      breath={
        <>
          Native to where your customers already are — triaged the moment it
          lands, with full context, even when no one&apos;s watching.
        </>
      }
      visual={<ThreadsListVisual />}
      topics={TOPICS}
    />
  );
}
