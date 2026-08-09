# 0012 — Qdrant normalizes Cosine vectors; client-side normalization is not a recall concern

**Status:** Accepted **Date:** 2026-08-08

## Context

Our embedding call sites disagree about L2-normalizing vectors before they reach Qdrant. The entity and thread embedders divide by the vector norm; the documentation query embedder (`lib/documentation-embedding.ts`) does not.

This inconsistency reads as a retrieval defect every time someone finds it — most recently in an architecture review, which flagged the unnormalized query path as a "silent recall bug" and ranked a cross-app embedding refactor partly on that basis. It is not one, and the cost of re-deriving that each time is a refactor sized against a problem that does not exist.

Every [index](../../CONTEXT.md#index) we run uses `Cosine` distance. Qdrant normalizes vectors for `Cosine` on both sides — stored vectors at upsert time, and the query vector at search time — and then compares them with a dot product. Cosine similarity is scale-invariant by definition, so scaling a query vector by any positive constant cannot reorder results.

## Decision

Treat client-side L2 normalization as **cosmetic under `Cosine` distance**, not as a correctness property.

Concretely:

- A normalization difference between embedding call sites is a **consistency** issue, worth fixing when those call sites are being unified for other reasons. It is not a retrieval-quality issue and does not justify a refactor on its own.
- Do not add normalization to a query path expecting ranking to change. It will not.
- This holds **only** for `Cosine`. If an index is ever created with `Dot` or `Euclid`, magnitude becomes load-bearing and normalization becomes a correctness property of that index. Record that on the index if it happens.

## Consequences

- The "one embedding space, four embedders" cleanup is scored on duplication and on a single place to swap models — not on recall. It stays worth doing, at lower priority than it first appeared.
- `generateDocumentationQueryEmbedding` keeps its current behavior and carries a comment pointing here, so the next reader does not re-open this.
- Any future index using a non-`Cosine` distance must state its normalization requirement explicitly; this ADR does not cover it.
