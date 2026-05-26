import { z } from "zod";

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
  dismissedAt: z.string().optional(),
});
export type ThreadRead = z.infer<typeof threadReadSchema>;

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

// --- Status labels (kept) -------------------------------------------------

export const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "In progress",
  2: "Resolved",
  3: "Closed",
  4: "Duplicated",
};
