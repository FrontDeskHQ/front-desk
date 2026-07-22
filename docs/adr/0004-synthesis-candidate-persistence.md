# 0004 — Persist synthesis-track candidates on the thread

**Status:** Superseded by [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md) **Date:** 2026-05-26 **References:** [ADR 0002](./0002-two-track-candidate-pipeline.md)

> **Superseded (2026-05-28).** The per-thread, per-processor skip+rehydrate _mechanism_ described here is retained, but it now persists _evidence_ (`thread.hints`), not concrete `Action` candidates (`thread.synthesisCandidates`). See [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md).

## Context

[ADR 0002](./0002-two-track-candidate-pipeline.md) split the candidate pipeline into an inline track (label, status — writes directly to `thread.inlineSuggestions`) and a synthesis track (duplicate, draft, link_pr, close — composed by an LLM call into `thread.agentRead`). The original framing treated synthesis-track candidates as _ephemeral_: generated in-memory inside the synthesis worker, consumed immediately, discarded.

Two requirements broke that framing once the synthesis track was wired into the existing pipeline framework (`apps/worker/src/pipeline/`):

1. **Per-generator input-aware skip.** Each generator should skip when its declared inputs are unchanged. The framework already supports this via `ProcessorDefinition.computeHash` + the `pipelineIdempotencyKey` table, but skipping means "produced no new output." If a generator skips, an in-memory candidate bag would be missing its slice.
2. **Synthesis must see a complete candidate bag.** If only one of four generators reran, an in-memory-only model would hand synthesis a partial bag (one fresh candidate, three holes) — and the LLM, seeing nothing from `duplicate`, would produce different output than it would have with the prior cached `duplicate` candidate visible. That's non-determinism we control by simply remembering the prior outputs.

The existing pipeline framework has no general-purpose mechanism for persisting processor outputs across runs. `JobContext.setProcessorOutput` is in-memory only; today's processors (`summarize`, `embed`, `embed-messages`) sidestep this by writing their results directly to authoritative stores (thread columns, Qdrant).

## Considered options

1. **All-or-nothing skip.** Synthesize's hash includes the four generator hashes. If all skipped, synthesize skips. If any reran, synthesize reruns — but the LLM sees only the fresh candidates plus the prior `agentRead` for memory. _Rejected:_ the "partial bag on partial rerun" case is silently lossy. The LLM seeing two fresh candidates and missing two cached ones produces surprising reads with no clear diagnosis.
2. **Generic `processorOutput(threadId, processorName, dataStr)` table** with `JobContext` hydration on cold start. _Rejected for now:_ net-new infrastructure on the critical path for a benefit only the synthesis track currently needs. Revisit if a second consumer ever appears.
3. **Per-generator persistence on `thread` itself.** Either four columns or one fat JSON column.

## Decision

Add a single JSON column `thread.synthesisCandidates` shaped as:

```ts
type SynthesisCandidates = {
  duplicate?: {
    candidate: MarkDuplicateAction | null;
    hash: string;
    computedAt: string;
  };
  draft?: { candidate: ReplyAction | null; hash: string; computedAt: string };
  link_pr?: {
    candidate: LinkPrAction | null;
    hash: string;
    computedAt: string;
  };
  close?: { candidate: CloseAction | null; hash: string; computedAt: string };
};
```

Each generator's `execute` always writes its slot when it runs — including writing `candidate: null` when it ran and decided nothing was warranted. Outer keys remain optional (absent = "this generator has never run for this thread"). Synthesis reads the column directly; null inner candidates appear in the prompt as "this generator checked and produced no candidate," distinguishable from absent generators.

A fat JSON column is chosen over four sibling columns to keep the synthesis-track shape co-located and to let the schema grow (or shrink) as the generator set changes without further migrations.

## Consequences

- Synthesis always sees a deterministic candidate bag — fresh slices for generators that reran, prior slices for generators that skipped, explicit nulls for "ran, nothing to suggest," absences for "never ran."
- `thread.synthesisCandidates` is observability for free: at any moment you can read what each generator last thought about a thread, including its "no" answers. Useful in dev tools and in per-generator eval scoring.
- Three storage locations now live on `thread` (`agentRead`, `inlineSuggestions`, `synthesisCandidates`). All three are slim per-thread JSON; none are queried across threads in their structured form. Acceptable column growth on a hot table.
- The pipeline framework remains unchanged. Persistence is generator-side (a small `writeSynthesisCandidateSlot` helper); the orchestrator still treats outputs as ephemeral via `setProcessorOutput`.
- If a second pipeline ever wants the same property, this decision should be revisited toward a generic `processorOutput` table instead of growing more bespoke per-table JSON columns.
