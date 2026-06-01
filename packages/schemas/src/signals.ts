import { z } from "zod";

const stableHash = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

// --- Action vocabulary ----------------------------------------------------

// Synthesis-track actions: composed by the synthesis LLM into a ThreadRead.
export const replyActionSchema = z.object({
  kind: z.literal("reply"),
  draftMarkdown: z.string(),
});
export type ReplyAction = z.infer<typeof replyActionSchema>;

export const markDuplicateActionSchema = z.object({
  kind: z.literal("mark_duplicate"),
  targetThreadId: z.string(),
});
export type MarkDuplicateAction = z.infer<typeof markDuplicateActionSchema>;

export const linkPrActionSchema = z.object({
  kind: z.literal("link_pr"),
  prUrl: z.string(),
});
export type LinkPrAction = z.infer<typeof linkPrActionSchema>;

export const closeActionSchema = z.object({
  kind: z.literal("close"),
});
export type CloseAction = z.infer<typeof closeActionSchema>;

// Inline-track actions: emitted directly by inline generators.
export const applyLabelActionSchema = z.object({
  kind: z.literal("apply_label"),
  labelId: z.string(),
});
export type ApplyLabelAction = z.infer<typeof applyLabelActionSchema>;

export const setStatusActionSchema = z.object({
  kind: z.literal("set_status"),
  status: z.number().int(),
});
export type SetStatusAction = z.infer<typeof setStatusActionSchema>;

export const actionSchema = z.discriminatedUnion("kind", [
  replyActionSchema,
  markDuplicateActionSchema,
  linkPrActionSchema,
  closeActionSchema,
  applyLabelActionSchema,
  setStatusActionSchema,
]);
export type Action = z.infer<typeof actionSchema>;

export const ACTION_KINDS = [
  "reply",
  "mark_duplicate",
  "link_pr",
  "close",
  "apply_label",
  "set_status",
] as const;
export const actionKindSchema = z.enum(ACTION_KINDS);
export type ActionKind = z.infer<typeof actionKindSchema>;

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  reply: "Send reply",
  mark_duplicate: "Mark duplicate",
  link_pr: "Link pull request",
  close: "Close thread",
  apply_label: "Apply label",
  set_status: "Set status",
};

// --- Reversibility + track partition --------------------------------------

export const REVERSIBLE_ACTIONS: ReadonlySet<ActionKind> = new Set([
  "apply_label",
  "set_status",
  "mark_duplicate",
]);
export const isReversible = (action: Action): boolean =>
  REVERSIBLE_ACTIONS.has(action.kind);

export const SYNTHESIS_ACTION_KINDS: ReadonlySet<ActionKind> = new Set([
  "reply",
  "mark_duplicate",
  "link_pr",
  "close",
]);
export const INLINE_ACTION_KINDS: ReadonlySet<ActionKind> = new Set([
  "apply_label",
  "set_status",
]);
export const isSynthesisAction = (action: Action): boolean =>
  SYNTHESIS_ACTION_KINDS.has(action.kind);
export const isInlineAction = (action: Action): boolean =>
  INLINE_ACTION_KINDS.has(action.kind);

// --- ThreadRead -----------------------------------------------------------

export const threadReadSchema = z.object({
  summary: z.string(),
  reasoning: z.string(),
  primary: z.array(actionSchema),
  alternatives: z.array(actionSchema).optional(),
  urgencyScore: z.number().min(0).max(100),
  sourceInputMessageId: z.string(),
  /** ISO timestamp when synthesis produced this read. */
  createdAt: z.string().optional(),
  dismissedAt: z.string().optional(),
});
export type ThreadRead = z.infer<typeof threadReadSchema>;

/** Stable fingerprint for stale-read guards (web + API). */
export const fingerprintAgentRead = (read: ThreadRead): string => {
  const payload = {
    summary: read.summary,
    reasoning: read.reasoning,
    primary: read.primary,
    alternatives: read.alternatives ?? [],
    urgencyScore: read.urgencyScore,
    sourceInputMessageId: read.sourceInputMessageId,
  };
  return stableHash(JSON.stringify(payload));
};

export type UrgencyTier = "red" | "orange" | "yellow";
export const urgencyTierFromScore = (score: number): UrgencyTier => {
  if (score >= 80) return "red";
  if (score >= 50) return "orange";
  return "yellow";
};

// --- InlineSuggestion -----------------------------------------------------

export const inlineSuggestionActionSchema = z.discriminatedUnion("kind", [
  applyLabelActionSchema,
  setStatusActionSchema,
]);
export type InlineSuggestionAction = z.infer<
  typeof inlineSuggestionActionSchema
>;

export const inlineSuggestionSchema = z.object({
  id: z.string(),
  action: inlineSuggestionActionSchema,
  confidence: z.number().min(0).max(1),
  generator: z.string(),
  createdAt: z.string(),
  dismissedAt: z.string().optional(),
});
export type InlineSuggestion = z.infer<typeof inlineSuggestionSchema>;

export const inlineSuggestionsSchema = z.array(inlineSuggestionSchema);
export type InlineSuggestions = z.infer<typeof inlineSuggestionsSchema>;

// --- Read hints (evidence bag) --------------------------------------------

export const duplicateEvidenceSchema = z.object({
  threadId: z.string(),
  score: z.number().min(0).max(1),
  title: z.string(),
  shortDescription: z.string().optional(),
});
export type DuplicateEvidence = z.infer<typeof duplicateEvidenceSchema>;

export const relatedDocEvidenceItemSchema = z.object({
  docId: z.string(),
  title: z.string(),
  url: z.string().optional(),
  score: z.number().min(0).max(1),
});
export type RelatedDocEvidenceItem = z.infer<typeof relatedDocEvidenceItemSchema>;

export const relatedDocsEvidenceSchema = z.object({
  docs: z.array(relatedDocEvidenceItemSchema),
});
export type RelatedDocsEvidence = z.infer<typeof relatedDocsEvidenceSchema>;

export type HintSlot<E> = {
  evidence: E | null;
  hash: string;
  computedAt: string;
};

export type Hints = {
  duplicate?: HintSlot<DuplicateEvidence>;
  related_docs?: HintSlot<RelatedDocsEvidence>;
};

export const HINT_KINDS = ["duplicate", "related_docs"] as const;
export type HintKind = (typeof HINT_KINDS)[number];

// --- Autonomy -------------------------------------------------------------

export const autonomyLevelSchema = z.enum(["off", "suggest", "auto"]);
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;

export const actionAutonomyMapSchema = z.partialRecord(
  actionKindSchema,
  autonomyLevelSchema,
);
export type ActionAutonomyMap = z.infer<typeof actionAutonomyMapSchema>;

export function getDefaultActionAutonomy(): Record<ActionKind, AutonomyLevel> {
  const out = {} as Record<ActionKind, AutonomyLevel>;
  for (const k of ACTION_KINDS) {
    out[k] = REVERSIBLE_ACTIONS.has(k) ? "suggest" : "off";
  }
  return out;
}

// --- Autonomous-action receipt metadata (undo path; unchanged) ------------

export const autonomousActionMetadataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("apply_label"), labelId: z.string() }),
  z.object({ kind: z.literal("set_status"), previousStatus: z.number() }),
  z.object({
    kind: z.literal("mark_duplicate"),
    relatedThreadId: z.string(),
    score: z.number().nullable(),
    previousStatus: z.number(),
  }),
  z.object({ kind: z.literal("link_pr"), prId: z.string() }),
]);
export type AutonomousActionMetadata = z.infer<
  typeof autonomousActionMetadataSchema
>;

export function parseAutonomousActionMetadata(
  metadataStr: string | null,
): AutonomousActionMetadata | null {
  if (!metadataStr) return null;
  try {
    return autonomousActionMetadataSchema.parse(JSON.parse(metadataStr));
  } catch {
    return null;
  }
}

// --- Trigger / queue --------------------------------------------------------

export const threadReadKindSchema = z.enum([
  "message",
  "pr_matched",
  "sla",
  "supersede",
  "manual",
]);
export type ThreadReadKind = z.infer<typeof threadReadKindSchema>;

export const threadReadJobDataSchema = z.object({
  threadId: z.string(),
  kind: threadReadKindSchema,
});
export type ThreadReadJobData = z.infer<typeof threadReadJobDataSchema>;

// --- Status labels (kept) -------------------------------------------------

export const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "In progress",
  2: "Resolved",
  3: "Closed",
  4: "Duplicated",
};
