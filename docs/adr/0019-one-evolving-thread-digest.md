# 0019 — Use one evolving thread digest for similarity

**Status:** Accepted **Date:** 2026-08-21 **References:** [ADR 0005](./0005-hints-as-evidence-agentic-synthesis.md), [ADR 0012](./0012-qdrant-normalizes-cosine-vectors.md)

## Context

The thread digest originally described the title and first message, so its embedding remained anchored to the initial interpretation even when later customer evidence materially changed the case. A configuration-looking report could become a concrete product defect while duplicate and related-entity retrieval continued searching for the original configuration problem.

Two representations could preserve both views: an immutable initial-intent digest for thread similarity and a current-case digest for other retrieval. That would make every retrieval consumer choose between overlapping meanings, introduce two vectors whose rankings can disagree, and retain an initial interpretation after the conversation has disproved it.

## Decision

Maintain one [thread digest](../../CONTEXT.md#thread-digest) and one thread embedding representing the current unresolved case.

- Derive the digest from the complete conversation, not only the first message.
- Let later material customer evidence update the current problem and required resolution while retaining earlier context when it explains the present state.
- Recompute the digest and embedding when the conversation changes, allowing similarity and retrieval rankings to evolve as the case becomes better understood.
- Treat the digest as processor-facing evidence, not as an immutable account of the customer's initial intent and not as the human-facing summary in a thread read.

## Consequences

- Duplicate and related-entity candidates may change over the life of a thread. This is intentional: similarity describes the case as currently understood, not its historical opening classification.
- A vague follow-up must not move a case into engineering work merely because earlier guidance failed; the digest needs a concrete new symptom or outcome before changing that classification.
- Historical initial intent, if needed for analytics, must be recorded as separate metadata rather than encoded as a second retrieval vector.
