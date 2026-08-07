import { z } from "zod";

export { sanitizeAgentReadReasoning } from "./sanitize-agent-read-reasoning";

const stableHash = (value: string): string => {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i++) {
    const codePoint = value.codePointAt(i) ?? 0;
    hash = Math.imul((hash + codePoint) % 4_294_967_296, 16_777_619);
    if (hash < 0) {
      hash += 4_294_967_296;
    }
  }
  return (hash % 4_294_967_296).toString(16).padStart(8, "0");
};

// --- Action vocabulary ----------------------------------------------------

// Synthesis-track actions: composed by the synthesis LLM into a ThreadRead.
export const replyActionSchema = z.object({
  draftMarkdown: z.string(),
  kind: z.literal("reply"),
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

/**
 * Point a thread at an already-mirrored [external issue](../../CONTEXT.md).
 * Local-only and reversible: it writes `thread.externalIssueId` and posts
 * nothing upstream — deliberately *not* mirroring `link_pr`, which invokes
 * `pr-tracker/link` to leave a back-reference comment.
 */
export const linkIssueActionSchema = z.object({
  /** Canonical URL of the mirrored issue; the handler routes by it. */
  issueUrl: z.string(),
  kind: z.literal("link_issue"),
});
export type LinkIssueAction = z.infer<typeof linkIssueActionSchema>;

/**
 * File a new external issue and link it to the thread in one atomic handler.
 * Non-reversible. The body must reproduce the *problem*, never the reporter:
 * issues can land in a public repo, and the authed thread-link footer is the
 * only path back to the customer.
 */
export const createIssueActionSchema = z.object({
  body: z.string(),
  kind: z.literal("create_issue"),
  title: z.string(),
});
export type CreateIssueAction = z.infer<typeof createIssueActionSchema>;

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
  linkIssueActionSchema,
  createIssueActionSchema,
  closeActionSchema,
  applyLabelActionSchema,
  setStatusActionSchema,
]);
export type Action = z.infer<typeof actionSchema>;

export const ACTION_KINDS = [
  "reply",
  "mark_duplicate",
  "link_pr",
  "link_issue",
  "create_issue",
  "close",
  "apply_label",
  "set_status",
] as const;
export const actionKindSchema = z.enum(ACTION_KINDS);
export type ActionKind = z.infer<typeof actionKindSchema>;

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  apply_label: "Apply label",
  close: "Close thread",
  create_issue: "File issue",
  link_issue: "Link issue",
  link_pr: "Link pull request",
  mark_duplicate: "Mark duplicate",
  reply: "Just reply",
  set_status: "Set status",
};

/**
 * Short verb phrases used to compose compound-bundle button copy, e.g.
 * "Reply and close" or "Reply and do 2 actions". Lower-cased so they read
 * naturally mid-sentence; the leading verb is capitalized at render time.
 */
export const ACTION_KIND_VERB: Record<ActionKind, string> = {
  apply_label: "apply label",
  close: "close",
  create_issue: "file issue",
  link_issue: "link issue",
  link_pr: "link PR",
  mark_duplicate: "mark duplicate",
  reply: "reply",
  set_status: "set status",
};

// --- Reversibility + track partition --------------------------------------

export const REVERSIBLE_ACTIONS: ReadonlySet<ActionKind> = new Set([
  "apply_label",
  "set_status",
  "mark_duplicate",
  // Local-only: `link_issue` writes `thread.externalIssueId` and posts nothing
  // upstream, so restoring the previous id fully undoes it.
  "link_issue",
]);
export const isReversible = (action: Action): boolean =>
  REVERSIBLE_ACTIONS.has(action.kind);

export const SYNTHESIS_ACTION_KINDS: ReadonlySet<ActionKind> = new Set([
  "reply",
  "mark_duplicate",
  "link_pr",
  "link_issue",
  "create_issue",
  "close",
]);
export const INLINE_ACTION_KINDS: ReadonlySet<ActionKind> = new Set([
  "apply_label",
  "set_status",
]);
/**
 * Actions that settle a thread's single issue link. At most one may appear
 * across primary and alternatives — a thread links one issue — and the two may
 * never be bundled together: `create_issue` already links what it files, so
 * pairing it with `link_issue` would need the created issue's id to flow from
 * one executed step into the next, which ADR 0003's executor deliberately
 * cannot do.
 */
export const ISSUE_ACTION_KINDS: ReadonlySet<ActionKind> = new Set([
  "link_issue",
  "create_issue",
]);
export const isIssueAction = (action: Action): boolean =>
  ISSUE_ACTION_KINDS.has(action.kind);

export const isSynthesisAction = (action: Action): boolean =>
  SYNTHESIS_ACTION_KINDS.has(action.kind);
export const isInlineAction = (action: Action): boolean =>
  INLINE_ACTION_KINDS.has(action.kind);

// --- ThreadRead -----------------------------------------------------------

export const threadReadSchema = z.object({
  alternatives: z.array(actionSchema).optional(),
  /** ISO timestamp when synthesis produced this read. */
  createdAt: z.string().optional(),
  dismissedAt: z.string().optional(),
  primary: z.array(actionSchema),
  reasoning: z.string(),
  /** Actionable output: the imperative next move, tied to `primary`. */
  recommendation: z.string().trim().min(1),
  sourceInputMessageId: z.string(),
  /** Thread summary: the customer situation (what they want or reported). */
  summary: z.string(),
  urgencyScore: z.number().min(0).max(100),
});
export type ThreadRead = z.infer<typeof threadReadSchema>;

/** Stable fingerprint for stale-read guards (web + API). */
export const fingerprintAgentRead = (read: ThreadRead): string => {
  const payload = {
    alternatives: read.alternatives ?? [],
    primary: read.primary,
    reasoning: read.reasoning,
    recommendation: read.recommendation,
    sourceInputMessageId: read.sourceInputMessageId,
    summary: read.summary,
    urgencyScore: read.urgencyScore,
  };
  return stableHash(JSON.stringify(payload));
};

export interface ActionExecutionResult {
  succeeded: Action[];
  failed: { action: Action; error: unknown } | null;
  rolledBack: Action[];
}

/**
 * True when `succeeded` refers to the same primary entry as `candidate`. Reply
 * drafts are edited at execution time (the human tweaks `draftMarkdown` before
 * accepting), so a succeeded reply won't deep-equal the stored read entry —
 * match replies by kind, everything else by value.
 */
const matchesReadEntry = (candidate: Action, succeeded: Action): boolean => {
  if (candidate.kind !== succeeded.kind) {
    return false;
  }
  if (candidate.kind === "reply") {
    return true;
  }
  return JSON.stringify(candidate) === JSON.stringify(succeeded);
};

/**
 * Computes the agent read to persist after a (possibly partial) execution.
 * Shared by API (human accept) and worker (autonomous) so post-execution state
 * can't drift between the two call paths.
 *
 * Returns null when nothing actionable remains; otherwise the read trimmed of
 * already-succeeded actions so a retry can't replay them (which would duplicate
 * non-idempotent side effects like replies).
 */
export const nextAgentReadAfterExecution = (
  read: ThreadRead,
  result: ActionExecutionResult
): ThreadRead | null => {
  if (!result.failed) {
    return null;
  }

  if (result.rolledBack.length > 0 && result.succeeded.length === 0) {
    return read;
  }

  // Consume one matching primary entry per success so duplicate entries aren't
  // all dropped for a single succeeded action.
  const remainingPrimary = [...read.primary];
  for (const succeeded of result.succeeded) {
    const idx = remainingPrimary.findIndex((action) =>
      matchesReadEntry(action, succeeded)
    );
    if (idx !== -1) {
      remainingPrimary.splice(idx, 1);
    }
  }

  if (remainingPrimary.length === 0) {
    return null;
  }

  return {
    ...read,
    primary: remainingPrimary,
  };
};

export type UrgencyTier = "red" | "orange" | "yellow";
export const urgencyTierFromScore = (score: number): UrgencyTier => {
  if (score >= 80) {
    return "red";
  }
  if (score >= 50) {
    return "orange";
  }
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
  action: inlineSuggestionActionSchema,
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
  dismissedAt: z.string().optional(),
  generator: z.string(),
  id: z.string(),
});
export type InlineSuggestion = z.infer<typeof inlineSuggestionSchema>;

export const inlineSuggestionsSchema = z.array(inlineSuggestionSchema);
export type InlineSuggestions = z.infer<typeof inlineSuggestionsSchema>;

// --- Read hints (evidence bag) --------------------------------------------

export const duplicateEvidenceSchema = z.object({
  score: z.number().min(0).max(1),
  shortDescription: z.string().optional(),
  threadId: z.string(),
  title: z.string(),
});
export type DuplicateEvidence = z.infer<typeof duplicateEvidenceSchema>;

export const relatedDocEvidenceItemSchema = z.object({
  docId: z.string(),
  score: z.number().min(0).max(1),
  title: z.string(),
  url: z.string().optional(),
});
export type RelatedDocEvidenceItem = z.infer<
  typeof relatedDocEvidenceItemSchema
>;

export const relatedDocsEvidenceSchema = z.object({
  docs: z.array(relatedDocEvidenceItemSchema),
});
export type RelatedDocsEvidence = z.infer<typeof relatedDocsEvidenceSchema>;

/**
 * A single eligible PR the pull-side `related_prs` hint (FRO-206) found similar
 * to the thread. `url` is what synthesis passes to read_pr / link_pr; `prId` is
 * the mirror row id so downstream can resolve the FrontDesk PR row.
 */
export const relatedPrEvidenceItemSchema = z.object({
  /** Provider-agnostic key `provider:owner/repo#number`. */
  externalKey: z.string(),
  number: z.number(),
  /** Mirror row id (`externalEntity.id`). */
  prId: z.string(),
  repoFullName: z.string(),
  score: z.number().min(0).max(1),
  title: z.string(),
  url: z.string(),
});
export type RelatedPrEvidenceItem = z.infer<typeof relatedPrEvidenceItemSchema>;

export const relatedPrsEvidenceSchema = z.object({
  prs: z.array(relatedPrEvidenceItemSchema),
});
export type RelatedPrsEvidence = z.infer<typeof relatedPrsEvidenceSchema>;

/**
 * A single [external issue](../../CONTEXT.md) the pull-side `related_issues`
 * hint found similar to the thread. There is no push-side counterpart: issues
 * are filed constantly and most have no waiting customer, so an `issue_matched`
 * trigger's noise profile would be far worse than `pr_matched`'s.
 *
 * `state` travels with the evidence on purpose. Unlike PRs, a *closed* issue is
 * eligible — often it is the most useful thing to link ("this was fixed in
 * #412") and the strongest reason not to file a new one — so synthesis decides
 * what the state means rather than the index deciding for it.
 */
export const relatedIssueEvidenceItemSchema = z.object({
  /** Provider-agnostic key `provider:owner/repo#number`. */
  externalKey: z.string(),
  /** Mirror row id (`externalEntity.id`). */
  issueId: z.string(),
  number: z.number(),
  repoFullName: z.string(),
  score: z.number().min(0).max(1),
  /** Upstream issue state ("open" | "closed"); never an eligibility filter. */
  state: z.string(),
  title: z.string(),
  url: z.string(),
});
export type RelatedIssueEvidenceItem = z.infer<
  typeof relatedIssueEvidenceItemSchema
>;

export const relatedIssuesEvidenceSchema = z.object({
  issues: z.array(relatedIssueEvidenceItemSchema),
});
export type RelatedIssuesEvidence = z.infer<typeof relatedIssuesEvidenceSchema>;

export interface HintSlot<E> {
  evidence: E | null;
  hash: string;
  computedAt: string;
}

export interface Hints {
  duplicate?: HintSlot<DuplicateEvidence>;
  related_docs?: HintSlot<RelatedDocsEvidence>;
  related_prs?: HintSlot<RelatedPrsEvidence>;
  related_issues?: HintSlot<RelatedIssuesEvidence>;
}

export const HINT_KINDS = [
  "duplicate",
  "related_docs",
  "related_prs",
  "related_issues",
] as const;
export type HintKind = (typeof HINT_KINDS)[number];
export const hintKindSchema = z.enum(HINT_KINDS);

const hintSlotSchema = <E extends z.ZodTypeAny>(evidence: E) =>
  z.object({
    computedAt: z.string(),
    evidence: evidence.nullable(),
    hash: z.string(),
  });

export const duplicateHintSlotSchema = hintSlotSchema(duplicateEvidenceSchema);
export const relatedDocsHintSlotSchema = hintSlotSchema(
  relatedDocsEvidenceSchema
);
export const relatedPrsHintSlotSchema = hintSlotSchema(
  relatedPrsEvidenceSchema
);
export const relatedIssuesHintSlotSchema = hintSlotSchema(
  relatedIssuesEvidenceSchema
);

// --- Autonomy -------------------------------------------------------------

export const autonomyLevelSchema = z.enum(["off", "suggest", "auto"]);
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;

export const actionAutonomyMapSchema = z.partialRecord(
  actionKindSchema,
  autonomyLevelSchema
);
export type ActionAutonomyMap = z.infer<typeof actionAutonomyMapSchema>;

/**
 * Per-kind starting autonomy. Explicit rather than derived: the old
 * `reversible ? "suggest" : "off"` rule broke on `create_issue`, which is
 * non-reversible yet ships at `suggest` — filing an issue is the whole point of
 * offering the action, and a human reviews every one under the default. Every
 * pre-existing kind keeps the value the derivation gave it.
 */
export const DEFAULT_ACTION_AUTONOMY: Record<ActionKind, AutonomyLevel> = {
  apply_label: "suggest",
  close: "off",
  create_issue: "suggest",
  link_issue: "suggest",
  link_pr: "off",
  mark_duplicate: "suggest",
  reply: "off",
  set_status: "suggest",
};

export function getDefaultActionAutonomy(): Record<ActionKind, AutonomyLevel> {
  return { ...DEFAULT_ACTION_AUTONOMY };
}

/**
 * Kinds an org may raise all the way to `auto`. Reversible actions qualify by
 * construction (undo is a receipt away); `create_issue` is the one
 * non-reversible exception — `auto` mode has a deterministic destination in the
 * org's default issue target, and the setting's help text carries the warning.
 * Everything else is capped at `suggest` because it is destructive or
 * customer-facing.
 */
export const AUTO_CAPABLE_ACTIONS: ReadonlySet<ActionKind> = new Set([
  ...REVERSIBLE_ACTIONS,
  "create_issue",
]);

/**
 * [Action availability](../../CONTEXT.md): whether the org *can* perform an
 * action at all, resolved before synthesis runs so the prompt and the output
 * schema never offer a move that cannot execute. Distinct from autonomy, which
 * is whether the org has *permitted* the Agent — an unavailable action is not
 * "off", and folding the two together would both lose that distinction and
 * waste the read when the whole set is discarded.
 *
 * Only kinds that need an explicit rule appear here. The rest self-gate on
 * evidence: with no mirrored PRs there is no candidate, so `link_pr` is never
 * proposed. `create_issue` needs no evidence, so it needs this.
 */
export interface ActionAvailability {
  /** True when the org has a usable [default issue target](../../CONTEXT.md). */
  create_issue: boolean;
}

export const actionAvailabilitySchema = z.object({
  create_issue: z.boolean(),
});

// --- Autonomous-action receipt metadata (undo path; unchanged) ------------

export const autonomousActionMetadataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("apply_label"), labelId: z.string() }),
  z.object({ kind: z.literal("set_status"), previousStatus: z.number() }),
  z.object({
    kind: z.literal("mark_duplicate"),
    previousStatus: z.number(),
    relatedThreadId: z.string(),
    score: z.number().nullable(),
  }),
  z.object({ kind: z.literal("link_pr"), prId: z.string() }),
  z.object({
    kind: z.literal("link_issue"),
    /** The link the thread carried before, restored verbatim on undo (null
     * when the thread had no issue linked). */
    previousIssueId: z.string().nullable(),
  }),
]);
export type AutonomousActionMetadata = z.infer<
  typeof autonomousActionMetadataSchema
>;

export function parseAutonomousActionMetadata(
  metadataStr: string | null
): AutonomousActionMetadata | null {
  if (!metadataStr) {
    return null;
  }
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

/**
 * Candidate PR pushed by a `pr_matched` trigger. This is a *fuzzy* push-side
 * similarity match (see ADR 0006) — synthesis treats it as a lead, not a
 * confirmed link. `prId` is the mirrored FrontDesk PR row id; `score` is the
 * cosine similarity of the match (0–1).
 */
export const prMatchCandidateSchema = z.object({
  prId: z.string(),
  score: z.number().min(0).max(1),
  title: z.string(),
  url: z.string(),
});
export type PrMatchCandidate = z.infer<typeof prMatchCandidateSchema>;

/**
 * The trigger-context channel (ADR 0006): the cause of a pipeline run plus any
 * payload it pushed. Kept separate from `hints` so synthesis can distinguish a
 * push-side `pr_matched` candidate from a pull-side `related_prs` hint.
 */
export const threadReadTriggerSchema = z.object({
  kind: threadReadKindSchema,
  prMatched: prMatchCandidateSchema.optional(),
});
export type ThreadReadTrigger = z.infer<typeof threadReadTriggerSchema>;

const canonicalThreadReadJobDataSchema = z.object({
  threadId: z.string(),
  triggers: z.array(threadReadTriggerSchema).min(1),
});

/**
 * Pre-generational payload retained for rolling deployments. The old enqueue
 * path could leave a `prMatched` candidate attached to a different winning
 * `kind`; normalization restores both causes instead of losing either one.
 */
export const legacyThreadReadJobDataSchema = z.object({
  kind: threadReadKindSchema,
  prMatched: prMatchCandidateSchema.optional(),
  threadId: z.string(),
});
export type LegacyThreadReadJobData = z.infer<
  typeof legacyThreadReadJobDataSchema
>;

const triggerIdentity = (trigger: ThreadReadTrigger): string =>
  trigger.kind === "pr_matched" && trigger.prMatched
    ? `pr_matched:${trigger.prMatched.prId}`
    : trigger.kind;

/**
 * Merge causes without overwriting them. The first occurrence fixes arrival
 * position; a later trigger with the same identity replaces its payload so a
 * refreshed PR candidate carries the newest title, URL, and score.
 */
export const mergeThreadReadTriggers = (
  ...collections: readonly (readonly ThreadReadTrigger[])[]
): ThreadReadTrigger[] => {
  const merged: ThreadReadTrigger[] = [];
  const positions = new Map<string, number>();

  for (const trigger of collections.flat()) {
    const parsed = threadReadTriggerSchema.parse(trigger);
    const identity = triggerIdentity(parsed);
    const position = positions.get(identity);
    if (position === undefined) {
      positions.set(identity, merged.length);
      merged.push(parsed);
    } else {
      merged[position] = parsed;
    }
  }

  return merged;
};

const THREAD_READ_KIND_ORDER = new Map<ThreadReadKind, number>(
  threadReadKindSchema.options.map((kind, index) => [kind, index])
);

/** Stable order for hashes and equality checks; queue payload order stays FIFO. */
export const sortThreadReadTriggers = (
  triggers: readonly ThreadReadTrigger[]
): ThreadReadTrigger[] =>
  [...triggers].sort((left, right) => {
    const kindDelta =
      (THREAD_READ_KIND_ORDER.get(left.kind) ?? 0) -
      (THREAD_READ_KIND_ORDER.get(right.kind) ?? 0);
    if (kindDelta !== 0) {
      return kindDelta;
    }
    return triggerIdentity(left).localeCompare(triggerIdentity(right));
  });

export const normalizeThreadReadJobData = (
  input: unknown
): { threadId: string; triggers: ThreadReadTrigger[] } => {
  const canonical = canonicalThreadReadJobDataSchema.safeParse(input);
  if (canonical.success) {
    return {
      threadId: canonical.data.threadId,
      triggers: mergeThreadReadTriggers(canonical.data.triggers),
    };
  }

  const legacy = legacyThreadReadJobDataSchema.parse(input);
  const triggers: ThreadReadTrigger[] = legacy.prMatched
    ? legacy.kind === "pr_matched"
      ? [{ kind: "pr_matched", prMatched: legacy.prMatched }]
      : [
          { kind: legacy.kind },
          { kind: "pr_matched", prMatched: legacy.prMatched },
        ]
    : [{ kind: legacy.kind }];
  return {
    threadId: legacy.threadId,
    triggers: mergeThreadReadTriggers(triggers),
  };
};

export const threadReadJobDataSchema = z
  .union([canonicalThreadReadJobDataSchema, legacyThreadReadJobDataSchema])
  .transform(normalizeThreadReadJobData);
export type ThreadReadJobData = z.infer<typeof threadReadJobDataSchema>;

// --- PR embedding index (FRO-203) -----------------------------------------

/**
 * Contract for a `pr-index` job: the API enqueues one after every mirror write
 * that touches an [external pull request](../../CONTEXT.md); the worker embeds
 * it (title + body + head ref) and upserts it into the PR vector index with an
 * `eligible` flag (open, non-draft). This channel is **index-only** — it never
 * fans out `pr_matched` thread reads (that push path is separate).
 *
 * The worker derives eligibility itself from `state`/`draft` rather than
 * trusting a precomputed flag, so the mirror row stays the single source of
 * truth. A `deleted` job signals the mirror row was soft-deleted (issue/PR
 * removed or transferred out) and the vector should be dropped — it carries
 * only the identity fields, since none of the embed content is meaningful for a
 * delete.
 */
const prIndexIdentity = {
  /** Mirror row id (`externalEntity.id`); stored on the vector so a push-side
   * match can resolve it back to a `PrMatchCandidate.prId`. */
  externalEntityId: z.string(),
  /** Provider-agnostic key `provider:owner/repo#number`; the vector's identity. */
  externalKey: z.string(),
  organizationId: z.string(),
};

/** Upsert variant: embed the PR and (re)index it with a derived `eligible` flag. */
export const prIndexUpsertSchema = z.object({
  ...prIndexIdentity,
  body: z.string().nullable(),
  deleted: z.literal(false).optional(),
  /** Draft flag; a draft PR is never eligible. */
  draft: z.boolean().nullable(),
  headRef: z.string().nullable(),
  number: z.number(),
  provider: z.string(),
  repoFullName: z.string(),
  /** Upstream PR state ("open" | "closed"); drives eligibility. */
  state: z.string(),
  title: z.string(),
  url: z.string(),
});

/** Delete variant: drop the vector. Carries only identity — no embed content.
 * Strict so a payload with stray embed keys fails instead of silently parsing
 * as an identity-only delete. */
export const prIndexDeleteSchema = z.strictObject({
  ...prIndexIdentity,
  deleted: z.literal(true),
});

export const prIndexJobDataSchema = z.union([
  prIndexUpsertSchema,
  prIndexDeleteSchema,
]);
export type PrIndexJobData = z.infer<typeof prIndexJobDataSchema>;
/** The upsert (embed-and-index) variant, narrowed from a non-`deleted` job. */
export type PrIndexUpsertJobData = z.infer<typeof prIndexUpsertSchema>;

// --- Issue embedding index (FRO-217) --------------------------------------

/**
 * Contract for an `issue-index` job, the [issue index](../../CONTEXT.md)'s
 * counterpart to `pr-index`: the API enqueues one after every mirror write that
 * touches an external issue, and the worker embeds it (title + body) into the
 * issue vector collection.
 *
 * **There is no eligibility flag.** Every non-deleted issue is indexed and
 * searchable regardless of open/closed state — a closed issue is frequently the
 * best link a thread can have. `state` rides along in the payload so synthesis
 * can weigh it; the index never filters on it.
 *
 * A `deleted` job signals the mirror row was soft-deleted (issue removed or
 * transferred out) and the vector should be dropped; it carries only the
 * identity fields, since no embed content is meaningful for a delete.
 */
const issueIndexIdentity = {
  /** Mirror row id (`externalEntity.id`), stored on the vector so a hit can be
   * resolved back to a `RelatedIssueEvidenceItem.issueId`. */
  externalEntityId: z.string(),
  /** Provider-agnostic key `provider:owner/repo#number`; the vector's identity. */
  externalKey: z.string(),
  organizationId: z.string(),
};

/** Upsert variant: embed the issue and (re)index it. */
export const issueIndexUpsertSchema = z.object({
  ...issueIndexIdentity,
  body: z.string().nullable(),
  deleted: z.literal(false).optional(),
  number: z.number(),
  provider: z.string(),
  repoFullName: z.string(),
  /** Upstream issue state ("open" | "closed"); carried, never filtered on. */
  state: z.string(),
  title: z.string(),
  url: z.string(),
});

/** Delete variant: drop the vector. Identity only — strict so a payload with
 * stray embed keys fails instead of silently parsing as a delete. */
export const issueIndexDeleteSchema = z.strictObject({
  ...issueIndexIdentity,
  deleted: z.literal(true),
});

export const issueIndexJobDataSchema = z.union([
  issueIndexUpsertSchema,
  issueIndexDeleteSchema,
]);
export type IssueIndexJobData = z.infer<typeof issueIndexJobDataSchema>;
/** The upsert (embed-and-index) variant, narrowed from a non-`deleted` job. */
export type IssueIndexUpsertJobData = z.infer<typeof issueIndexUpsertSchema>;

// --- PR push-side match (FRO-205) -----------------------------------------

/**
 * Contract for a `match-pr` job: GitHub webhooks enqueue one when an eligible
 * PR opens / reopens / is marked ready-for-review / is edited (not on
 * `synchronize`). The worker embeds the PR (title + body + head ref), searches
 * for similar Open / In-progress unlinked [threads](../../CONTEXT.md), and fans
 * out a `pr_matched` thread read per strong match (ADR 0006 trigger channel).
 *
 * This is the *push* side of PR↔thread discovery — distinct from the index-only
 * `pr-index` channel (FRO-203), which keeps the vector current but never fans
 * out reads. The worker re-derives eligibility from `state` / `draft` so a
 * stale enqueue for a since-closed / re-drafted PR is dropped.
 */
export const prMatchJobDataSchema = z.object({
  body: z.string().nullable(),
  /** Draft flag; a draft PR is never eligible. */
  draft: z.boolean().nullable(),
  /** Provider-agnostic key `provider:owner/repo#number`; the PR's identity. */
  externalKey: z.string(),
  headRef: z.string().nullable(),
  organizationId: z.string(),
  /** Upstream PR state ("open" | "closed"); drives eligibility. */
  state: z.string(),
  title: z.string(),
});
export type PrMatchJobData = z.infer<typeof prMatchJobDataSchema>;

// --- Status labels (kept) -------------------------------------------------

export const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "In progress",
  2: "Resolved",
  3: "Closed",
  4: "Duplicated",
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Low priority",
  2: "Medium priority",
  3: "High priority",
  4: "Urgent priority",
};
