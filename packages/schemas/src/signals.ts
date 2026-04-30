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
