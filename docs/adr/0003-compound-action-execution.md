# 0003 — Compound action execution: reversibles first, ordered at execute time

**Status:** Accepted **Date:** 2026-05-25

## Context

A compound primary like `[mark_duplicate, reply]` runs multiple actions in response to one Accept click. The first draft of the signals overhaul claimed atomic rollback on any failure, but several actions in the vocabulary are non-reversible by construction (`reply`, `link_pr`, `close`). Once a GitHub comment has been posted or a message sent, no application-level rollback recovers the side effect. The "atomic bundle" guarantee was unachievable as stated.

We still want:

- A real atomicity guarantee where it's possible.
- Predictable failure behaviour the UI can communicate.
- Flexibility for synthesis to emit compounds without micromanaging order.

## Decision

Compound primary execution is **ordered at execute time**, not at synthesis time. Synthesis emits the bundle as an unordered set; the executor partitions and sequences:

1. **Reversibles first.** All reversible actions in the bundle run as a transactional prefix. If any reversible step fails, the prefix rolls back; no non-reversible step runs; the signal stays active for retry.
2. **Non-reversibles second, in synthesis-emitted order.** Run sequentially. Once the first non-reversible commits, the bundle is past the atomic boundary — earlier successful steps are not rolled back even if a later non-reversible fails.

On partial completion past the atomic boundary, the UI surfaces what succeeded and what failed; the user retries the remaining step(s) manually. The `agentRead` is updated to reflect the new state (e.g. the duplicate link now exists; the reply is still owed).

The `reply(draft)` UX is unchanged: Send / Review buttons govern the bundle exactly as before. Reply is the terminal step that commits the prefix when sent.

## Consequences

- The atomicity guarantee is honest: "atomic across reversibles; commit-as-you-go past the first non-reversible."
- Synthesis-output schema does not need to encode action order. Validation only checks that the action set is well-formed.
- Adding a new action requires declaring it reversible or not (already required for undo). The executor uses that flag for partitioning.
- A bundle of all non-reversibles (e.g. `[link_pr, reply]`) has no atomic guarantee — runs sequentially, partial failure surfaces partial state. Acceptable because the alternative (forbid the compound) hurts the product.
