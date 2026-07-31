/**
 * 02 — Handles it like you would.
 */

import { NarrativeSection } from "../shared/narrative-section";
import type { NarrativeTopic } from "../shared/narrative-section";

import { ThreadDetailVisual } from "./thread-detail-visual";

const TOPICS: readonly NarrativeTopic[] = [
  {
    lead: "Resolves the routine, end to end.",
    body: "How-tos, status, refunds, common bugs — answered, not routed.",
  },
  {
    lead: "On-brand, never canned.",
    body: "Tuned on your past replies, docs, and tone. Reads like your best teammate wrote it.",
  },
  {
    lead: "Knows what it doesn't know.",
    body: "Asks or escalates instead of guessing.",
  },
  {
    lead: "Gets better every day.",
    body: "Every draft you edit becomes its training.",
  },
];

export function RepliesSection() {
  return (
    <NarrativeSection
      id="handles-it"
      title="Handles it like you would."
      breath={<>It doesn&apos;t just reply. It resolves.</>}
      visual={<ThreadDetailVisual />}
      topics={TOPICS}
    />
  );
}
