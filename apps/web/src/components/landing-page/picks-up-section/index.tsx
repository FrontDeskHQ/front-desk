/**
 * 01 — Picks up every conversation.
 */

import { NarrativeSection } from "../shared/narrative-section";
import type { NarrativeTopic } from "../shared/narrative-section";

import { ThreadsListVisual } from "./threads-list-visual";

const TOPICS: readonly NarrativeTopic[] = [
  {
    lead: "Native to every channel.",
    body: "Slack, Discord, email, and GitHub — plus a portal of your own, for customers who'd rather have one.",
  },
  {
    lead: "Triaged before you open it.",
    body: "Every message is read, understood, and given a next step the moment it arrives. You come back to decisions, not a pile.",
  },
  {
    lead: "Knows who it's talking to.",
    body: "It pulls the customer's history, past threads, and account data from your own systems — and acts on what it finds.",
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
