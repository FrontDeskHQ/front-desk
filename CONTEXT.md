# Context

Glossary of domain terms. Implementation lives in code; decisions live in `docs/adr/`.

## Terms

### Signal

Umbrella term for items the Agent puts in the feed for human attention. Today only [thread reads](#thread-read) exist; [pattern signals](#pattern-signal) are a planned second kind. [Inline suggestions](#inline-suggestion) are explicitly *not* signals — they live on a different surface.

### Thread read

The Agent's synthesis output for a single thread: a summary, reasoning, a ranked primary action (possibly compound), and optional secondary actions. Produced by the synthesis LLM call. At most one active per thread; re-reads replace. Stored on `thread.agentRead`.

A thread read exists only when the Agent has a **substantive next move** (reply, mark duplicate, close, link PR, etc.). Pure metadata enrichments (label, status) are not thread reads — see [Inline suggestion](#inline-suggestion).

### Inline suggestion

A lightweight, per-candidate proposal that bypasses synthesis and renders on the thread view itself. The canonical (and currently only) examples are suggested labels and suggested status changes — *all* label/status proposals live here, regardless of whether a [thread read](#thread-read) also exists on the thread. Written directly by candidate generators when autonomy mode is `suggest`. Multiple inline suggestions can coexist on one thread; each has its own accept / dismiss lifecycle. Stored on `thread.inlineSuggestions`.

Inline suggestions never appear standalone in the feed. When a thread also has a thread read, its inline suggestions render alongside that read's card in the feed; otherwise they surface only on the thread view.

### Pattern signal

A cross-thread observation produced by a periodic cron scan. Three kinds today: `trending_issue`, `kb_gap`, `churn_risk`. Org-scoped, stackable (no replace-on-upsert), assignable. Stored in the `patternSignal` table.

### Feed

The page (formerly `/signals`) where thread reads and pattern signals surface for human attention. Shows "you're all caught up" when empty. Inline suggestions do not appear here.

### Candidate

The output of a single generator (label classifier, duplicate search, status inferer, draft writer) for one thread: an action plus confidence and provenance. Ephemeral — not persisted. Consumed by the synthesis stage (which folds them into a thread read) or, for `suggest`-mode metadata candidates, written directly as an inline suggestion.

### Synthesis

The single LLM call that turns candidates + thread context into a thread read. Owns routing: decides whether a thread warrants a read at all, what the primary action is, and what rides as secondaries. When synthesis decides there is no substantive read, eligible candidates may still surface as inline suggestions.

### Autonomous action

A receipt of work the Agent performed without human approval. Stored in `autonomousAction`. Carries an undo affordance when the action is reversible by construction.
