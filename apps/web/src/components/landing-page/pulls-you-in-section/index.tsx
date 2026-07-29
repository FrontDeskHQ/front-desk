/**
 * 03 — Pulls you in only when it matters.
 */

import { NarrativeSection } from "../shared/narrative-section";
import type { NarrativeTopic } from "../shared/narrative-section";

import { SignalsVisual } from "./signals-visual";

const TOPICS: readonly NarrativeTopic[] = [
  {
    lead: "The hard 20% comes to you.",
    body: "With full context and a suggested reply, ready to send.",
  },
  {
    lead: "You set the rules.",
    body: "Decide what the Agent sends on its own and what always needs a human.",
  },
  {
    lead: "No black box.",
    body: "Every autonomous reply is logged, attributed, and reversible.",
  },
  {
    lead: "Your time, where it matters.",
    body: "Attention goes to the relationships that need you.",
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
