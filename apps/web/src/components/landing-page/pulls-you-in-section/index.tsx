/**
 * 03 — Pulls you in only when it matters.
 */

import { NarrativeSection } from "../shared/narrative-section";
import type { NarrativeTopic } from "../shared/narrative-section";

import { SignalsVisual } from "./signals-visual";

const TOPICS: readonly NarrativeTopic[] = [
  {
    lead: "A briefing, not a notification.",
    body: "Every signal carries the summary, the history, and the reasoning behind it — enough to act without reading the thread from the top.",
  },
  {
    lead: "It never just hands you a problem.",
    body: "Each one arrives with a recommended move and the alternatives it weighed, ready to send or adjust.",
  },
  {
    lead: "Nothing happens off the record.",
    body: "Every action, autonomous or human, lands on the thread's timeline — with a receipt and an undo.",
  },
];

export function PullsYouInSection() {
  return (
    <NarrativeSection
      id="pulls-you-in"
      title={
        <>
          Pulls you in
          <br />
          only when it matters.
        </>
      }
      breath="The Agent does the heavy lifting. You own the moments that count."
      visual={<SignalsVisual />}
      topics={TOPICS}
    />
  );
}
