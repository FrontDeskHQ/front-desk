# 0006 — Triggers carry context on a channel separate from hints

**Status:** Accepted (amended 2026-07-19) **Date:** 2026-05-28 **References:** [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md)

## Context

A pipeline run has a cause: a new message, a PR↔thread similarity match, an SLA breach, a supersede, a manual re-read. Today that cause is a bare enum tag on the BullMQ job (`{ threadId, kind }`) carrying no payload — it selects behaviour but adds no data.

Some triggers want to _supply_ data to synthesis. The motivating case is `pr_matched`: after an [external pull request](../../CONTEXT.md) is mirrored, a worker job embeds it and searches for similar [threads](../../CONTEXT.md); each strong match enqueues a thread-pipeline run that carries the candidate PR. That data could reach synthesis two ways:

1. Pre-seed it into `thread.hints` as a synthetic hint, so synthesis only ever reads one surface.
2. Carry it on a distinct trigger-context channel, separate from the [read hints](./0005-hints-as-evidence-agentic-synthesis.md) the detectors produced.

Option 1 is uniform but conflates two genuinely different things: _what a thread-side detector found while serving this thread_ vs _why this run was triggered and with what pushed candidate_. A push-side match is not the same object as a pull-side `related_prs` hint (even though both may be fuzzy): one is the _cause_ of the run with a specific PR attached; the other is breadth evidence computed inside the thread pipeline. Flattening the push into a hint slot loses that provenance and risks the two paths overwriting each other.

> **Amendment (2026-07-19).** The original text called `pr_matched` an _authoritative_ GitHub-side link. That was wrong. Deterministic linking (e.g. a FrontDesk thread URL already present on the PR) does **not** produce a [thread read](../../CONTEXT.md) — it is a separate pure-link path. `pr_matched` is a **fuzzy** push-side similarity match; synthesis still decides whether to emit `link_pr`.

## Decision

Triggers carry an optional typed payload, and that payload reaches synthesis on a **trigger-context channel separate from hints**. The job schema grows from `{ threadId, kind }` to carry kind + optional payload (e.g. the candidate PR for `pr_matched`); `JobContext` carries the trigger through to synthesis.

Synthesis therefore reconciles **two input surfaces**:

- `hints` — what detectors found (breadth evidence, possibly fuzzy) — including pull-side `related_prs`.
- `trigger` — why this run happened and any payload it pushed (for `pr_matched`, the candidate PR + score).

The trigger _kind_ also continues to drive cadence and hash-invalidation (e.g. a `message` trigger invalidates the status hint).

**Job coalescing.** There remains one pending pipeline job per thread (`thread:{id}:read`). A job carries an ordered, deduplicated `triggers` list rather than one latest cause. When causes race (e.g. `pr_matched` then `message` while still delayed), merge rather than overwrite; multiple `pr_matched` causes may preserve multiple PR candidates, deduplicated by mirrored PR id and replaced with the newest candidate data.

When the stable job is already active and BullMQ cannot update its payload, merge the causes into a durable per-thread Redis pending record with a monotonic generation. On terminal completion or terminal failure, the worker drains that record into one immediate follow-up job; an intermediate retry does not drain it. Worker startup also recovers pending records left behind by a process restart. Enqueue callers receive a structured disposition (`scheduled`, `coalesced`, `buffered`, or `skipped`) so active-job buffering is observable rather than reported as a successful enqueue with no follow-up.

**Synthesis reruns.** Synthesis uses the canonical trigger list in its idempotency hash and opts out of the dependency-only skip fast path whenever a non-`supersede` trigger is present. This ensures trigger context can cause a read even when detector inputs are unchanged; `supersede` remains a separate clear-read path.

## Consequences

- Provenance is preserved: synthesis can weight push-side `pr_matched` candidates differently from a pull-side `related_prs` hint, even when both concern PRs.
- Synthesis has two surfaces to reconcile rather than one — marginally more prompt-shaping work, accepted for the clarity of cause-vs-evidence.
- Push (`pr_matched`) and pull (`related_prs`) coexist without fighting over a shared hint slot.
- Producers of `pr_matched` jobs must populate the PR payload; enqueue must merge trigger causes and payloads when updating an existing delayed/waiting job.
- Active jobs cannot lose a later cause: pending causes survive process boundaries and are replayed once the active run reaches a terminal state.
- Authoritative/deterministic PR↔thread linking stays out of this channel and out of thread reads.
