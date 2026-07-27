# 0002 — Two-track candidate pipeline

**Status:** Accepted (synthesis-track internals amended by [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md)) **Date:** 2026-05-25

> **Amended (2026-05-28).** The inline/synthesis _track split_ below still holds. The synthesis track's internals do not: candidate generators that emit concrete `Action`s + a single composing LLM call are replaced by evidence-emitting hint processors + a tool-using synthesis agent. See [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md).

## Context

Previous design had a single candidate-generation stage feeding the synthesis LLM call: label classifier, status inferer, duplicate search, draft writer all produced candidates; synthesis composed them into a single output.

That model conflated two kinds of work:

- **Metadata enrichments** (label, status) — cheap, classifier-driven, no composition needed. Want to surface as discrete chips the user accepts or dismisses individually.
- **Substantive next moves** (reply, mark duplicate, link PR, close) — require LLM judgement to compose into a coherent recommendation. Want a single ranked read.

Storing label/status as `secondaries` on a thread read forced two side-effects:

1. They had no home when no thread read existed (the "label-only" case).
2. They couldn't be individually dismissed without per-action state inside `suggestedActions`.

[ADR 0001](./0001-split-suggestion-table.md) introduced `thread.inlineSuggestions` as the home for these chips. This ADR follows the data split through the pipeline.

## Decision

Split candidate generators into two independent tracks.

**Inline track** — runs label classifier and status inferer. Writes directly to `thread.inlineSuggestions`. No LLM gate. Each generator decides its own cadence:

- Label: once on first inbound message + on manual re-read.
- Status: on every inbound message (conversation-sensitive).

**Synthesis track** — runs duplicate search, draft writer, PR matcher, close suggester. Output is a list of `Candidate`s consumed by the synthesis LLM call, which composes them into a `thread.agentRead` (or writes null if no substantive move).

Synthesis reads applied labels/status from `thread` columns as context. It does **not** see pending inline suggestions; surfacing low-confidence chips to the drafter is more likely to confuse than help.

The agentRead action vocabulary therefore drops `apply_label` and `set_status` — those are inline-only verbs. Synthesis actions are: `reply`, `mark_duplicate`, `link_pr`, `close`.

## Consequences

- Two pipeline halves run independently per trigger. Inline-track runs are cheap and parallelisable; synthesis is the only LLM cost on the critical path.
- Adding a new metadata enrichment = adding an inline generator + a chip renderer; no synthesis-schema change.
- Adding a new substantive action = adding a synthesis-track generator + a vocabulary entry + an accept handler + a reversibility entry.
- Auto-applied labels/status (autonomy=auto) are visible to synthesis via the thread columns, so the drafter naturally references the right state.
- Inline-track generators can race with synthesis; that's fine because they write to different fields.
