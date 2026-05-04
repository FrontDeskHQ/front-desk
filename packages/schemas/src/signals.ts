import { z } from "zod";

export const SIGNAL_TYPES = [
  "label",
  "duplicate",
  "duplicate_merge",
  "linked_pr",
  "pending_reply",
  "loop_to_close",
  "suggested_reply",
  "status",
  "churn_risk",
  "kb_gap",
  "trending_issue",
] as const;

export const signalTypeSchema = z.enum(SIGNAL_TYPES);
export type SignalType = z.infer<typeof signalTypeSchema>;

export const LOCKED_SIGNAL_TYPES: readonly SignalType[] = [
  "duplicate_merge",
  "suggested_reply",
  "loop_to_close",
] as const;

export const autonomyLevelSchema = z.enum(["off", "suggest", "auto"]);
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;

export const signalAutonomyMapSchema = z.partialRecord(
  signalTypeSchema,
  autonomyLevelSchema,
);
export type SignalAutonomyMap = z.infer<typeof signalAutonomyMapSchema>;

export function getDefaultSignalAutonomy(): Record<SignalType, AutonomyLevel> {
  const out = {} as Record<SignalType, AutonomyLevel>;
  for (const t of SIGNAL_TYPES) {
    out[t] = LOCKED_SIGNAL_TYPES.includes(t) ? "off" : "suggest";
  }
  return out;
}

export const churnRiskMetadataSchema = z.object({
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  tier: z.string().nullable(),
  arr: z.number().nullable(),
  triggerPhrases: z.array(
    z.object({
      threadId: z.string(),
      phrase: z.string(),
      messageId: z.string().nullable(),
    }),
  ),
});
export type ChurnRiskMetadata = z.infer<typeof churnRiskMetadataSchema>;

export const kbGapMetadataSchema = z.object({
  topic: z.string(),
  threadIds: z.array(z.string()),
  similarityScore: z.number().nullable(),
  clusterSummary: z.string().nullable(),
});
export type KbGapMetadata = z.infer<typeof kbGapMetadataSchema>;

export const trendingIssueMetadataSchema = z.object({
  topic: z.string(),
  threadIds: z.array(z.string()),
  velocity: z.number(),
  windowHours: z.number(),
});
export type TrendingIssueMetadata = z.infer<typeof trendingIssueMetadataSchema>;

// Stored `suggestion.type` values that don't match SIGNAL_TYPES one-to-one.
// Worker writes `"digest:pending_reply"` / `"digest:loop_to_close"`; the enum
// uses unprefixed names. Keep both: this helper normalizes.
export function signalTypeFromStored(stored: string): SignalType | null {
  const stripped = stored.startsWith("digest:") ? stored.slice(7) : stored;
  return (SIGNAL_TYPES as readonly string[]).includes(stripped)
    ? (stripped as SignalType)
    : null;
}

// Severity floor per signal type. Calibrated v1; tune later.
export const SIGNAL_SEVERITY: Record<SignalType, number> = {
  churn_risk: 90,
  pending_reply: 70,
  duplicate: 50,
  loop_to_close: 45,
  linked_pr: 40,
  status: 35,
  kb_gap: 30,
  trending_issue: 30,
  duplicate_merge: 0,
  suggested_reply: 0,
  label: 20,
};

// Display label per signal type.
export const SIGNAL_LABEL: Record<SignalType, string> = {
  churn_risk: "Churn risk",
  pending_reply: "Awaiting your reply",
  duplicate: "Likely duplicate",
  loop_to_close: "Notify customer",
  linked_pr: "Matching PR",
  status: "Suggested status",
  kb_gap: "Knowledge gap",
  trending_issue: "Trending issue",
  duplicate_merge: "Suggested merge",
  suggested_reply: "Suggested reply",
  label: "Suggested label",
};

// Past-tense verb used in the leverage report ("Auto-labeled 5 threads").
export const SIGNAL_REPORT_VERB: Record<SignalType, string> = {
  churn_risk: "Flagged churn risk on",
  pending_reply: "Nudged you on",
  duplicate: "Linked duplicates of",
  loop_to_close: "Closed loop on",
  linked_pr: "Linked PRs to",
  status: "Updated status on",
  kb_gap: "Spotted KB gaps for",
  trending_issue: "Spotted trending issues for",
  duplicate_merge: "Merged duplicates of",
  suggested_reply: "Drafted replies for",
  label: "Auto-labeled",
};

export type UrgencyTier = "red" | "orange" | "yellow";
export function urgencyTierFromScore(score: number): UrgencyTier {
  if (score >= 80) return "red";
  if (score >= 50) return "orange";
  return "yellow";
}

export type CustomerTier = "enterprise" | "paid" | "free" | null;

// Pure urgency scoring. Deterministic; no LLM.
//   severity (table) + slaRisk(ageHours, type) + customerTierBoost(ctx)
export function computeUrgency(input: {
  signalType: SignalType;
  ageHours: number;
  customerTier?: CustomerTier;
}): number {
  const severity = SIGNAL_SEVERITY[input.signalType] ?? 0;
  const sla = slaRisk(input.signalType, input.ageHours);
  const boost = customerTierBoost(input.customerTier);
  return Math.round(severity + sla + boost);
}

function slaRisk(type: SignalType, ageHours: number): number {
  const age = Math.max(0, ageHours);
  if (type === "pending_reply") {
    if (age <= 24) return (age / 24) * 40;
    return Math.min(40 + Math.floor((age - 24) / 24) * 10, 60);
  }
  return Math.min(age, 20);
}

function customerTierBoost(tier?: CustomerTier): number {
  if (tier === "enterprise") return 20;
  if (tier === "paid") return 10;
  return 0;
}

export const autonomousActionMetadataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("label"), labelId: z.string() }),
  z.object({ kind: z.literal("linked_pr"), prId: z.string() }),
  z.object({
    kind: z.literal("duplicate"),
    relatedThreadId: z.string(),
    score: z.number().nullable(),
  }),
  z.object({ kind: z.literal("status"), previousStatus: z.number() }),
]);
export type AutonomousActionMetadata = z.infer<
  typeof autonomousActionMetadataSchema
>;
