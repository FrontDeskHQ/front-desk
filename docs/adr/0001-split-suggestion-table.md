# 0001 — Split the `suggestion` table

**Status:** Accepted
**Date:** 2026-05-24

## Context

The `suggestion` table held two genuinely different concepts:

1. **Thread reads** — the Agent's synthesis for a single thread. Cardinality is one-per-thread, lifecycle is replace-on-upsert, conceptually a property of the thread.
2. **Pattern signals** — cron-driven cross-thread observations. Org-scoped, stackable, independent lifecycle.

A third concept was being shoe-horned into the same row via `suggestedActions.secondaries[]`:

3. **Inline suggestions** — cheap per-candidate proposals (suggested label, suggested status) that don't warrant the Agent's synthesis pipeline. These only fit in `suggestion` when a parent thread-read row existed; with nothing substantive to surface, they had no home.

Symptoms of the forced marriage:
- A `flavor` discriminator existed only because the table held two shapes.
- A "no composite index in live-state" TODO blocked enforcing the per-thread cardinality invariant.
- Product called these "signals" while the DB called them "suggestions."
- Inline metadata suggestions had no clean storage path when no thread read existed.

We are pre-launch with no production data, so renaming/restructuring is free.

## Decision

Drop the `suggestion` table. Replace with three storage locations, each named for what it holds:

- `thread.agentRead: json<ThreadRead> | null` — synthesis output. Cardinality of one is a column invariant. Null when no substantive next move exists.
- `thread.inlineSuggestions: json<InlineSuggestion[]>` — list of cheap candidate outputs (labels, status) that bypass synthesis. Stack, dismiss individually.
- `patternSignal` table — cross-thread observations. Deferred from this overhaul; designed when pattern signals are actually built.

Synthesis owns the routing decision (queue vs inline vs nothing) even when its own output is empty.

## Consequences

- Cardinality-1-per-thread is enforced by schema, not by application code; the live-state composite-index workaround disappears.
- Three terms — thread read, inline suggestion, pattern signal — replace the overloaded "suggestion." The product term "signal" is retained as the umbrella for feed-surface items.
- Candidate generators for `suggest`-mode metadata write directly to `thread.inlineSuggestions` without an LLM round-trip.
- Migration path: drop the table, no data preservation needed.
- Pattern-signal schema is left undesigned until the M3 work picks it up with real requirements.
