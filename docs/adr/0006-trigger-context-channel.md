# 0006 — Triggers carry context on a channel separate from hints

**Status:** Accepted
**Date:** 2026-05-28
**References:** [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md)

## Context

A pipeline run has a cause: a new message, an externally-matched PR, an SLA breach, a supersede, a manual re-read. Today that cause is a bare enum tag on the BullMQ job (`{ threadId, kind }`) carrying no payload — it selects behaviour but adds no data.

Some triggers now want to *supply* data to synthesis. The motivating case is `pr_matched`: a GitHub-side event establishes an authoritative thread↔PR link and carries the PR itself. That data could reach synthesis two ways:

1. Pre-seed it into `thread.hints` as a synthetic hint, so synthesis only ever reads one surface.
2. Carry it on a distinct trigger-context channel, separate from the [read hints](./0005-hints-as-evidence-agentic-synthesis.md) the detectors produced.

Option 1 is uniform but conflates two genuinely different things: *what a detector found by searching* vs *why this run was triggered and with what authoritative data*. An external PR link is not a fuzzy search result, and flattening it into a hint slot loses that provenance and risks a search-side hint overwriting (or being overwritten by) the pushed link.

## Decision

Triggers carry an optional typed payload, and that payload reaches synthesis on a **trigger-context channel separate from hints**. The job schema grows from `{ threadId, kind }` to `{ threadId, trigger: { kind, payload? } }`; `JobContext` carries the trigger through to synthesis.

Synthesis therefore reconciles **two input surfaces**:
- `hints` — what detectors found (breadth evidence, possibly fuzzy).
- `trigger` — why this run happened and any authoritative payload it pushed.

The trigger *kind* also continues to drive cadence and hash-invalidation (e.g. a `message` trigger invalidates the status hint).

## Consequences

- Provenance is preserved: synthesis can weight an authoritative `pr_matched` payload differently from a fuzzy search hint, even when both concern a PR.
- Synthesis has two surfaces to reconcile rather than one — marginally more prompt-shaping work, accepted for the clarity of cause-vs-evidence.
- A push trigger (`pr_matched`) and a hypothetical future pull-side PR-search hint can coexist without fighting over a shared slot.
- The job payload is no longer a bare enum; producers of `pr_matched` jobs must populate the PR payload.
