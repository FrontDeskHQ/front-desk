# 0005 — Read hints are evidence; synthesis is a tool-using agent

**Status:** Accepted
**Date:** 2026-05-28
**Supersedes:** [ADR 0004](./0004-synthesis-candidate-persistence.md)
**Amends:** [ADR 0002](./0002-two-track-candidate-pipeline.md)

## Context

[ADR 0002](./0002-two-track-candidate-pipeline.md) split the pipeline into an inline track and a synthesis track. The synthesis track was modelled as a set of **candidate generators** — `duplicate`, `draft`, `link_pr`, `close` — each emitting a ready-to-execute `Action`, with a single structured synthesis LLM call ranking and composing those actions into a `thread.agentRead`. [ADR 0004](./0004-synthesis-candidate-persistence.md) then persisted those per-generator actions on `thread.synthesisCandidates` so synthesis always saw a complete bag across partial reruns.

In practice that model drifted into something heavier than intended:

- Generators had to know how to *construct* actions (`mark_duplicate{targetThreadId}`, `reply{draftMarkdown}`), duplicating judgement that belongs in one place.
- A `draft` generator producing a full reply, and a `close` generator deciding closure, are not "candidates" — they are the synthesis decision itself, made in the wrong place.
- The synthesis LLM was a dumb composer: it could only rank what generators handed it, and could not chase a lead a generator never anticipated.
- `thread.synthesisCandidates` persisted *concrete actions*, coupling storage to the action vocabulary.

## Decision

Recast the synthesis track around **evidence** and a **tool-using synthesis agent**.

**Read hints are evidence, not actions.** A [hint processor](../../CONTEXT.md) gathers and scores evidence only — "thread #482 looks like a duplicate, score 0.91", "these docs are relevant" — and never proposes a concrete action. The hint set today is `duplicate` and `related_docs`. `thread.synthesisCandidates` becomes `thread.hints`, shaped as evidence slots rather than `Action` slots; the per-processor skip+rehydrate mechanism from ADR 0004 is retained (its *mechanism* was right; its *content* was wrong).

**Synthesis is a tool-using agent.** It reads the complete hint bag plus thread state, and uses tools to investigate leads **in depth** (fetch the full duplicate thread, read a PR, re-query docs with a refined term) before emitting actions. Division of labour: hints give **breadth** (always-on, cheap detectors that surface leads); tools give **depth** (on-demand investigation). Tools are also the fallback when a hint is missing, which is why the "complete deterministic bag" guarantee from ADR 0004 is no longer load-bearing — though we keep persistence to avoid recomputing expensive hints.

**Synthesis owns all substantive action decisions.** It emits the raw action set (`reply`, `close`, `mark_duplicate`, `link_pr`) — one primary (possibly compound) and optional pick-one alternatives. The `draft` and `close` generators are deleted; synthesis writes the draft and decides closure itself. `duplicate` is rewritten from an action-candidate generator into an evidence emitter.

This **amends** ADR 0002: its inline/synthesis *track split* stands, but the synthesis track is no longer "candidate generators + composing call." It **supersedes** ADR 0004: persistence stays, but stores evidence, not actions.

## Consequences

- One place owns action construction: synthesis. Hint processors shrink to retrieval + scoring and are independently evaluable on evidence quality, not action correctness.
- Synthesis can pursue leads beyond what detectors pre-computed, at the cost of variable latency and lower determinism than a single structured call. Accepted: the product wants judgement here.
- `thread.hints` is decoupled from the action vocabulary — adding an action kind no longer touches the persistence shape; adding a hint kind adds an evidence slot.
- Adding a new substantive action = a synthesis vocabulary entry + an executor/reversibility entry. No new generator.
- Adding new evidence = a hint processor + an evidence slot. No synthesis-schema change.
- Synthesis no longer writes `thread.agentRead` directly; after the agent returns, the synthesis processor calls a shared autonomy helper that applies policy, runs `auto`, and persists the read. No post-pipeline plumbing through `PipelineExecutionResult`.
