# 0006 — Triggers carry context on a channel separate from hints

**Status:** Accepted (amended 2026-07-19)
**Date:** 2026-05-28
**References:** [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md)

## Context

A pipeline run has a cause: a new message, a PR↔thread similarity match, an SLA breach, a supersede, a manual re-read. Today that cause is a bare enum tag on the BullMQ job (`{ threadId, kind }`) carrying no payload — it selects behaviour but adds no data.

Some triggers want to *supply* data to synthesis. The motivating case is `pr_matched`: after an [external pull request](../../CONTEXT.md) is mirrored, a worker job embeds it and searches for similar [threads](../../CONTEXT.md); each strong match enqueues a thread-pipeline run that carries the candidate PR. That data could reach synthesis two ways:

1. Pre-seed it into `thread.hints` as a synthetic hint, so synthesis only ever reads one surface.
2. Carry it on a distinct trigger-context channel, separate from the [read hints](./0005-hints-as-evidence-agentic-synthesis.md) the detectors produced.

Option 1 is uniform but conflates two genuinely different things: *what a thread-side detector found while serving this thread* vs *why this run was triggered and with what pushed candidate*. A push-side match is not the same object as a pull-side `related_prs` hint (even though both may be fuzzy): one is the *cause* of the run with a specific PR attached; the other is breadth evidence computed inside the thread pipeline. Flattening the push into a hint slot loses that provenance and risks the two paths overwriting each other.

> **Amendment (2026-07-19).** The original text called `pr_matched` an *authoritative* GitHub-side link. That was wrong. Deterministic linking (e.g. a FrontDesk thread URL already present on the PR) does **not** produce a [thread read](../../CONTEXT.md) — it is a separate pure-link path. `pr_matched` is a **fuzzy** push-side similarity match; synthesis still decides whether to emit `link_pr`.

## Decision

Triggers carry an optional typed payload, and that payload reaches synthesis on a **trigger-context channel separate from hints**. The job schema grows from `{ threadId, kind }` to carry kind + optional payload (e.g. the candidate PR for `pr_matched`); `JobContext` carries the trigger through to synthesis.

Synthesis therefore reconciles **two input surfaces**:
- `hints` — what detectors found (breadth evidence, possibly fuzzy) — including pull-side `related_prs`.
- `trigger` — why this run happened and any payload it pushed (for `pr_matched`, the candidate PR + score).

The trigger *kind* also continues to drive cadence and hash-invalidation (e.g. a `message` trigger invalidates the status hint).

**Job coalescing.** There remains one pending pipeline job per thread (`thread:{id}:read`). When causes race (e.g. `pr_matched` then `message` while still delayed), merge rather than overwrite: keep the PR payload and still run once so synthesis sees both surfaces.

## Consequences

- Provenance is preserved: synthesis can weight a push-side `pr_matched` candidate differently from a pull-side `related_prs` hint, even when both concern PRs.
- Synthesis has two surfaces to reconcile rather than one — marginally more prompt-shaping work, accepted for the clarity of cause-vs-evidence.
- Push (`pr_matched`) and pull (`related_prs`) coexist without fighting over a shared hint slot.
- Producers of `pr_matched` jobs must populate the PR payload; enqueue must merge payloads when updating an existing delayed/waiting job.
- Authoritative/deterministic PR↔thread linking stays out of this channel and out of thread reads.
