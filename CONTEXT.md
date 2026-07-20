# Context

Glossary of domain terms. Implementation lives in code; decisions live in `docs/adr/`.

## Terms

### Signal

Umbrella term for items the Agent puts in the feed for human attention. Today only [thread reads](#thread-read) exist; [pattern signals](#pattern-signal) are a planned second kind. [Inline suggestions](#inline-suggestion) are explicitly *not* signals — they live on a different surface.

### Thread read

The Agent's synthesis output for a single thread: a summary, reasoning, a ranked primary action (possibly compound), and optional pick-one alternatives. Composed by [synthesis](#synthesis) and persisted by the [autonomy helper](#autonomy-stage) after `off` actions are dropped and `auto` actions executed. At most one active per thread; re-reads replace. Stored on `thread.agentRead`.

A thread read exists only when the Agent has a **substantive next move** (reply, mark duplicate, close, link PR, etc.). Pure metadata enrichments (label, status) are not thread reads — see [Inline suggestion](#inline-suggestion).

### Inline suggestion

A lightweight, per-candidate proposal that bypasses synthesis and renders on the thread view itself. The canonical (and currently only) examples are suggested labels and suggested status changes — *all* label/status proposals live here, regardless of whether a [thread read](#thread-read) also exists on the thread. Written directly by candidate generators when autonomy mode is `suggest`. Multiple inline suggestions can coexist on one thread; each has its own accept / dismiss lifecycle. Stored on `thread.inlineSuggestions`.

Inline suggestions never appear standalone in the feed. When a thread also has a thread read, its inline suggestions render alongside that read's card in the feed; otherwise they surface only on the thread view.

### Pattern signal

A cross-thread observation produced by a periodic cron scan. Three kinds today: `trending_issue`, `kb_gap`, `churn_risk`. Org-scoped, stackable (no replace-on-upsert), assignable. Stored in the `patternSignal` table.

### Feed

The page (formerly `/signals`) where thread reads and pattern signals surface for human attention. Shows "you're all caught up" when empty. Inline suggestions do not appear here.

### Entry processor

A [processor](#processor) that prepares raw thread data for everything downstream — summarisation, embedding, message extraction. Its output is *processor-facing*, never user-facing. Both the [inline track](#inline-suggestion) and the [synthesis track](#read-hint) consume entry-processor output.

### Read hint

Evidence about a thread, computed eagerly by a [hint processor](#hint-processor) and read by [synthesis](#synthesis). A hint is *evidence, not an action*: "thread #482 looks like a duplicate, score 0.91", "these three docs are relevant", "these open PRs look related". Synthesis — not the hint processor — decides whether that evidence becomes an action. Hints provide **breadth** (always-on detectors that surface leads); synthesis tools provide **depth** (on-demand investigation of a lead). Persisted per-processor so synthesis sees a complete bag even when individual hint processors skip on unchanged inputs.

### Hint processor

A [processor](#processor) that produces zero or one [read hint](#read-hint) for a thread. The hints today are *duplicate* and *related-docs*; *related-PRs* is the pull-side counterpart to the `pr_matched` [trigger](#trigger) (thread → similar [external pull requests](#external-pull-request)). A hint processor only gathers and scores evidence; it never proposes a concrete action. Each owns its own input dependencies and skips when its prior hint is still valid.

### Processor

A unit of work in the pipeline with declared dependencies, run in dependency order. "Entry", "hint", and "synthesis" are *conceptual categories* of processor, not different code shapes — they all share one definition. The [inline track](#inline-suggestion) classifiers (label, status) are also processors but are a self-contained fast path: cheap, no LLM gate, calling the [autonomy helper](#autonomy-stage) after their LLM step before writing chips.

### Trigger

The cause of a pipeline run, and an *orthogonal* input to [synthesis](#synthesis) distinct from [read hints](#read-hint). Kinds: `message`, `pr_matched`, `sla`, `supersede`, `manual`. A trigger may carry a payload (e.g. `pr_matched` pushes the candidate [external pull request](#external-pull-request)), which reaches synthesis on its own **trigger-context channel** — synthesis reconciles two surfaces: *what detectors found* (hints) and *why I am running, with what* (trigger). The trigger kind also drives which hints are invalidated and recomputed.

`pr_matched` is **not** an authoritative link. It fires when a newly observed [external pull request](#external-pull-request) is found similar to one or more [threads](#thread) (e.g. embedding search); synthesis still decides whether to propose `link_pr`. Deterministic linking (e.g. a FrontDesk thread URL already present on the PR) is a separate path that does not produce a [thread read](#thread-read).

### Synthesis

The single tool-using LLM agent that turns [read hints](#read-hint) + [trigger](#trigger) context + thread state into a [thread read](#thread-read). It uses tools to investigate leads in depth, then emits a raw, unfiltered set of actions — one primary (possibly compound) and optional pick-one alternatives. Synthesis owns *all* substantive action decisions; it does not see or emit [inline-suggestion](#inline-suggestion) actions (label, status). It does not persist the [thread read](#thread-read) itself — after the agent returns, the synthesis processor calls the [autonomy helper](#autonomy-stage) to apply policy and persist.

### Autonomy stage

A deterministic, no-LLM helper (not a pipeline processor) that action-emitting processors call immediately after their LLM step. Per action kind it applies the org's setting (`off` → drop, `suggest` → leave for human, `auto` → execute now + write an [autonomous-action](#autonomous-action) receipt), then persists the surface (`thread.agentRead` or `thread.inlineSuggestions`). [Synthesis](#synthesis) calls it over the raw action set; [inline track](#inline-suggestion) processors call it over label/status proposals. Auto-mode fires the synthesis primary only; alternatives are never auto-executed.

### Autonomous action

A receipt of work the Agent performed without human approval. Stored in `autonomousAction`. Carries an undo affordance when the action is reversible by construction.

### Connector

The reusable provider code (Discord, Slack, GitHub) that adapts one external system to FrontDesk. A connector statically **declares** the set of [capabilities](#capability) it provides; the FrontDesk core interacts with those capabilities generically and never references a named provider. Distinct from an [integration](#integration), which is *one org's installed instance* of a connector.
_Avoid_: "provider" or "adapter" as the noun for this (reserve "provider" for the external system's name string, e.g. `provider: "github"`).

### Capability

A role a [connector](#connector) can play, expressed as a typed interface (a bundle of methods) the connector opts into implementing. Planned kinds: support entry point, issue tracker, PR tracker, team notification center. A connector may implement any number of them (GitHub = issue tracker + PR tracker; Slack = support entry point + notification center; Discord = support entry point only). The core asks "does this org have an integration whose connector provides capability X?" rather than naming a provider.

### Integration

One org's installed, configured instance of a [connector](#connector). A row in the `integration` table (`type`, `enabled`, `configStr`), scoped by `organizationId`. "Integration" is the *installed connection*, not the code that powers it (that is the [connector](#connector)) and not the role it plays (that is a [capability](#capability)).

### Thread

The unit of customer conversation in FrontDesk: a single stream of messages carrying its own state (status, labels, assignee) and the surface the Agent reads and acts on. A thread originates from one place — its `externalId` / `externalOrigin` record *where it came from* (Discord channel, Slack message, portal) — and may **link** to an [external issue](#external-issue) or [external pull request](#external-pull-request) without owning it. Stored in `thread`; the Agent's output for one lives on `thread.agentRead` (see [thread read](#thread-read)).

### External issue

An issue in an external developer system (today only GitHub) that FrontDesk **mirrors** read-only. GitHub is authoritative; our copy is a downstream replica updated only from inbound webhooks/backfill, never written canonically from our side. Identified provider-agnostically as `provider:owner/repo#number` (see `formatGitHubId`). A [thread](#thread) may **link** to an external issue; the link is a reference, not ownership.
_Avoid_: "GitHub issue" (we are provider-agnostic), "ticket".

### External pull request

A pull request in an external developer system that FrontDesk mirrors under the same read-mirror rules as an [external issue](#external-issue). Distinct from an external issue because it carries PR-only facets (merge state, draft, branches). A thread may link to one.
_Avoid_: "PR" alone when ambiguous, "merge request".

### Mirror

FrontDesk's local, read-only replica of authoritative external data ([external issues](#external-issue) and [external pull requests](#external-pull-request)). The external system is the source of truth; the mirror is only ever updated *from* it (webhooks + backfill + drift reconciliation), never written canonically from our side. Actions taken in FrontDesk go out to the external system and round-trip back into the mirror. Used as a verb ("we mirror the repo's issues") and a noun ("the mirror").
_Avoid_: "cache" (implies disposable/expiry; the mirror is durable and queried as primary), "sync copy".

### PR index

The vector index of mirrored [external pull requests](#external-pull-request), kept in step with the [mirror](#mirror) so PR↔thread similarity can be searched. Each indexed PR carries an **`eligible`** flag — true only while the PR is *open and non-draft* — and search filters to eligible PRs. Every mirror write (webhook, backfill, drift reconciliation) refreshes the index; close / convert-to-draft flips `eligible` false, reopen / ready_for_review / content edits refresh it. Indexing is **index-only**: it never enqueues a `pr_matched` [trigger](#trigger). This PR only *maintains* the index — it implements neither discovery flow. The index is intended to feed two future consumers: the push-side match (PR → similar threads) and the pull-side `related_prs` [hint](#read-hint) (thread → similar PRs). A PR is embedded from its *title + body + head ref*.

### Flagged ambiguities

**"External" is overloaded.** On a thread, `externalId` / `externalOrigin` mean *where the thread itself originated* (Discord channel, Slack message). This is **not** the same as a linked [external issue](#external-issue) / [external pull request](#external-pull-request), which is a separate developer-system entity the thread points to. When the origin is meant, say "thread origin"; when the linked entity is meant, say "external issue / pull request".
