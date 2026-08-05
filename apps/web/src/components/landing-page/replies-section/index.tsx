/**
 * 02 — Handles it like you would.
 */

import { NarrativeSection } from "../shared/narrative-section";
import type { NarrativeTopic } from "../shared/narrative-section";

import { ThreadDetailVisual } from "./thread-detail-visual";

const TOPICS: readonly NarrativeTopic[] = [
  {
    lead: "Grounded replies.",
    body: "It reads your docs, the threads you've already answered, and everything attached to the conversation before it writes a word.",
  },
  {
    lead: "You set the rules. It learns the rest.",
    body: "Say what it should never send on its own — then every draft you edit and every answer you mark teaches it the subtler details.",
  },
  {
    lead: "Built for public channels.",
    body: "When the same question comes back, it points to the thread that already answered it, so the answer compounds instead of repeating.",
  },
  {
    lead: "Closes the loop.",
    body: "Link a thread to a pull request and it follows the fix. When it ships, the customer hears about it.",
  },
];

export function RepliesSection() {
  return (
    <NarrativeSection
      id="handles-it"
      title="Handles it like you would."
      breath={
        <>
          The Agent reads the thread, checks your docs, and writes the reply.
          Sending it is up to you.
        </>
      }
      visual={<ThreadDetailVisual />}
      topics={TOPICS}
    />
  );
}
