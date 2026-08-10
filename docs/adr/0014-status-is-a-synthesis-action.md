# 0014 — Status is a synthesis action; inline suggestion is a surface, not a track

**Status:** Accepted **Date:** 2026-08-10 **Supersedes:** [ADR 0002](./0002-two-track-candidate-pipeline.md) **References:** [ADR 0001](./0001-split-suggestion-table.md), [ADR 0003](./0003-compound-action-execution.md)

## Context

[ADR 0002](./0002-two-track-candidate-pipeline.md) split candidate generation into two tracks on a **cost** axis: metadata enrichments (label, status) were "cheap, classifier-driven, no LLM gate" and belonged inline; substantive next moves (reply, mark duplicate, link PR, close) needed composition and belonged in synthesis.

Three things falsified that split.

**The cost axis was never real.** Both inline processors make LLM calls (`gemini-2.5-flash-lite` in `classify.ts` and `infer.ts`). The distinction was cheap-call vs. expensive-call, not classifier vs. LLM — and by then [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md) had already replaced the synthesis half's internals with a tool-using agent.

**0002's own consequences contradicted each other.** It claimed both that "auto-applied labels/status are visible to synthesis via the thread columns, so the drafter naturally references the right state" _and_ that "inline-track generators can race with synthesis; that's fine because they write to different fields." Racing is fine for writes; the first claim is a **read** dependency, and no such dependency exists — `synthesisProcessor.dependencies` never named an inline processor. The two tracks were consistent only while `auto` remained unimplemented. Implementing it, which is what prompted this ADR, is what activated the bug.

**The status inferer is structurally under-informed.** It sees the last six messages, the summary, and the current status — no hints, no tools. It therefore cannot observe a linked PR merging or a linked issue closing, which are precisely the events that finish a thread. Synthesis gathers exactly that evidence and runs on every non-`supersede` trigger, so the cadence argument for keeping them apart had also evaporated.

Splitting on cost also meant that `close` — a status write in all but name — sat in the synthesis vocabulary while `set_status` sat inline, so the same underlying change had two producers, two vocabularies, and two autonomy settings.

## Decision

Split on **consequence**, not cost.

**`close` is deleted; `set_status` joins the synthesis vocabulary.** This is not new capability — `close` already _was_ synthesis writing status, hardcoded to one destination. It generalizes to any status except `Duplicated`, which stays exclusive to `mark_duplicate`. `status_inferer` and its LLM call are deleted outright.

**`label_classifier` stays where it is.** Its hash is the thread id alone, so it fires once per thread on first inbound message; its input is the opening content against a fixed label set. There is nothing to investigate, and tools would add cost and no signal. It is genuine classification, and it is the one thing 0002 got right.

**Inline suggestion is a surface, not a pipeline half.** [ADR 0001](./0001-split-suggestion-table.md)'s data split — chips with individual accept/dismiss, a home for the label-only case — is untouched and remains correct. What 0002 got wrong was inferring a *producer* split from a *surface* split. `thread.inlineSuggestions` now has exactly one producer and one action kind, which is what keeps its required `confidence` scalar meaningful: only a classifier writes there, so only a classifier's score is stored.

**Synthesis-produced `set_status` lands on `thread.agentRead`, not on the chip surface.** A witness-gated move into a finished state closes a linked issue upstream and ends a customer conversation; that is a substantive next move by any reading, and it is a thread read even when it ships alone. The alternative — making `inlineSuggestion.confidence` optional so synthesis could write chips — was rejected because it would put a null score on the most consequential action in the vocabulary.

**Reply and status execute as one bundle.** [ADR 0003](./0003-compound-action-execution.md)'s executor already gives compound bundles ordered execution with compensation, so `[set_status, reply]` succeeds or rolls back together. This is the point of the merge: under 0002 the reply and the state it announces were two independent LLM decisions on two unordered tracks, so the Agent could tell a customer "closing this out" while nothing moved. That coordination gap closes by construction rather than by convention.

## Consequences

- What remains of the "inline track" is one label classifier. The folder name outlives the concept; CONTEXT.md describes the surface, not a track.
- `set_status` is now reachable from a compound bundle and from a chip, but only ever produced by one of them per kind — synthesis writes reads, the classifier writes chips.
- Adding a metadata enrichment is no longer automatically an inline generator. The question is whether it has consequences outside FrontDesk, not whether it is cheap.
- Auto-labelling means one label, at thread creation, never revisited — a direct consequence of the once-per-thread hash 0002 chose and this ADR keeps. Making labels track a thread as it evolves is a separate change to `computeHash`.
- `mark_duplicate` writes a finished status through `runMarkDuplicate`, bypassing `runSetThreadStatus` entirely. It is therefore untouched by this ADR and by [ADR 0015](./0015-witness-gated-thread-finishing.md)'s gate — a known, accepted gap.
