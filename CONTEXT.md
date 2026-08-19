# Context

Glossary of domain terms. Implementation lives in code; decisions live in `docs/adr/`.

## Terms

### Support Intelligence

Product name for the Agent's proposals to humans — [thread reads](#thread-read), [inline suggestions](#inline-suggestion), and the settings that govern them. The thread-toolbar control keeps this name; the thread-read surfaces themselves — the feed card and the thread-surface panel — do not. Not an object. _Avoid_: using it as a synonym for [thread read](#thread-read), [feed](#feed), or the conversational agent chat.

### Signal

Umbrella term for items the Agent puts in the [feed](#feed) for human attention. Today only [thread reads](#thread-read) exist; [pattern signals](#pattern-signal) are a planned second kind. [Inline suggestions](#inline-suggestion) are explicitly _not_ signals — they live on a different surface. A thread read on the thread it belongs to is still a thread read, not a signal. _Avoid_: calling the thread-view panel a signal.

### Thread read

The Agent's synthesis output for a single thread: a summary, reasoning, a ranked primary action (possibly compound), and optional pick-one alternatives. Composed by [synthesis](#synthesis) and persisted by the [autonomy helper](#autonomy-stage) after `off` actions are dropped and `auto` actions executed. At most one active per thread; re-reads replace. Stored on `thread.agentRead`. A read **outlives partial execution**: when some of its actions run and others do not, the read is rewritten to the remainder and records what already fired, so the actions still awaiting a human stay approvable. It is a _current position_, so a later re-read replaces it wholesale — an action nobody ruled on does not carry forward. Same object on two surfaces: the [feed](#feed) (as a [signal](#signal)) and the thread it belongs to. _Avoid_: "agent read" as the noun (that is the column), treating the conversational agent chat as a thread read.

A thread read exists only when the Agent has a **substantive next move** (reply, mark duplicate, set status, link PR, etc.) — substantive meaning it has consequences beyond FrontDesk's own metadata: it reaches the customer, another system, or the thread's place in the working set. Labelling is the one enrichment that does not qualify — see [Inline suggestion](#inline-suggestion).

### Inline suggestion

A lightweight proposal that bypasses [synthesis](#synthesis) and renders on the thread view — and, when the thread also has a [thread read](#thread-read), alongside that read on its feed card. A **surface, not a pipeline half** — the label classifier is its only producer and a suggested label its only kind, so the `confidence` scalar stored beside it always means the same thing. Written when autonomy is `suggest`; under `auto` a confident classification is applied outright and leaves an [autonomous action](#autonomous-action) instead. Multiple can coexist on one thread, each with its own accept / dismiss lifecycle. Stored on `thread.inlineSuggestions`. _Avoid_: "inline track" — status inference left for synthesis, and one classifier is not a track.

Inline suggestions never appear standalone in the feed. When a thread also has a thread read, they render alongside that read on both the feed card and the thread. Otherwise they surface only on the thread.

### Pattern signal

_Planned, not built._ A cross-thread observation produced by a periodic cron scan. Three kinds envisaged: `trending_issue`, `kb_gap`, `churn_risk`. Org-scoped, stackable (no replace-on-upsert), assignable. Would live in a `patternSignal` table.

### Feed

The page (formerly `/signals`) where thread reads — and, once built, [pattern signals](#pattern-signal) — surface for human attention across threads. A [thread read](#thread-read) also appears on the thread it belongs to; the feed is the inbox, not the only window. Shows "you're all caught up" when empty. Inline suggestions never appear here as their own items.

### Entry processor

A [processor](#processor) that prepares raw thread data for everything downstream — summarisation, embedding, message extraction. Its output is _processor-facing_, never user-facing. Both the label classifier behind [inline suggestions](#inline-suggestion) and the [synthesis track](#read-hint) consume entry-processor output.

### Read hint

Evidence about a thread, computed eagerly by a [hint processor](#hint-processor) and read by [synthesis](#synthesis). A hint is _evidence, not an action_: "thread #482 looks like a duplicate, score 0.91", "these three docs are relevant", "these open PRs look related". Synthesis — not the hint processor — decides whether that evidence becomes an action. Hints provide **breadth** (always-on detectors that surface leads); synthesis tools provide **depth** (on-demand investigation of a lead). Persisted per-processor so synthesis sees a complete bag even when individual hint processors skip on unchanged inputs.

### Hint processor

A [processor](#processor) that produces zero or one [read hint](#read-hint) for a thread. The hints today are _duplicate_ and _related-docs_; _related-PRs_ is the pull-side counterpart to the `pr_matched` [trigger](#trigger) (thread → similar [external pull requests](#external-pull-request)); _related-issues_ is its [external issue](#external-issue) counterpart and has no push-side trigger. A hint processor only gathers and scores evidence; it never proposes a concrete action. Each owns its own input dependencies and skips when its prior hint is still valid.

### Run

One execution of the pipeline over a single [thread](#thread). A run is the scope [processors](#processor) execute within, and the scope [read hints](#read-hint), [action availability](#action-availability) and the [autonomy stage](#autonomy-stage) share: a hint written by a [hint processor](#hint-processor) early in a run is visible to [synthesis](#synthesis) later in the same run, and availability is resolved once for the whole run. Several [triggers](#trigger) may coalesce into one run, so a run has _causes_ rather than a cause. _Avoid_: "batch" — a run covers exactly one thread, never several.

### Run record

A durable forensic record of one [run](#run), kept so the team can understand how the Agent reached a position or took an action after the run has finished. It preserves the run's causes, relevant inputs, observations, decisions, and outcomes without replacing the [thread read](#thread-read) or becoming a customer-facing activity history. _Avoid_: treating the run record as the current Agent surface or as a single log line.

### Run attempt

One actual worker execution of a [run](#run), including a retry after a queue failure. A run record keeps one attempt for each execution so a later investigation can distinguish the first failure from the retry that completed, rather than overwriting the earlier evidence. _Avoid_: calling a retry a new logical run when the queue job is the same cause.

### Run event

An ordered observation within a [run record](#run-record): a pipeline stage, model interaction, tool use, policy decision, gate result, or action outcome. Run events describe what happened and what the Agent was allowed to see at that point, so a sequence can be reconstructed instead of inferred only from the final [thread read](#thread-read). _Avoid_: using "event" for a new customer or queue trigger when the domain term is [trigger](#trigger).

### Agent-visible context

The thread state, [read hints](#read-hint), [trigger](#trigger) context, processor outputs, and tool results actually supplied to [synthesis](#synthesis) during a [run](#run). It is the evidence boundary for a [run record](#run-record): server-only configuration, credentials, and unrelated storage are outside it. _Avoid_: treating everything the worker can access as Agent-visible.

### Processor

A unit of work in the pipeline with declared dependencies, run in dependency order. "Entry", "hint", and "synthesis" are _conceptual categories_ of processor, not different code shapes — they all share one definition. The label classifier behind [inline suggestions](#inline-suggestion) is also a processor, on a self-contained fast path: one cheap LLM call, no [action gate](#action-gate), applying autonomy itself before writing a chip.

### Trigger

One cause of a pipeline run, and an _orthogonal_ input to [synthesis](#synthesis) distinct from [read hints](#read-hint). Kinds: `message`, `pr_matched`, `sla`, `supersede`, `manual`. A trigger may carry a payload (e.g. `pr_matched` pushes a candidate [external pull request](#external-pull-request)), which reaches synthesis on its own **trigger-context channel** — synthesis reconciles two surfaces: _what detectors found_ (hints) and _why I am running, with what_ (triggers). A thread-read job carries a collection of triggers so causes and multiple matched pull requests survive coalescing. Trigger kinds also drive which hints are invalidated and recomputed.

Only an **inbound** message causes a run (see [message direction](#message-direction)). An outbound one enqueues `supersede` instead: the Agent's own output, and the team's, never re-enter as a cause of the Agent running. See ADR 0017.

`pr_matched` is **not** an authoritative link. It fires when a newly observed [external pull request](#external-pull-request) is found similar to one or more [threads](#thread) (e.g. embedding search); synthesis still decides whether to propose `link_pr`. Deterministic linking (e.g. a FrontDesk thread URL already present on the PR) is a separate path that does not produce a [thread read](#thread-read).

### Synthesis

The single tool-using LLM agent that turns [read hints](#read-hint) + [trigger](#trigger) context + thread state into a [thread read](#thread-read). It uses tools to investigate leads in depth, then emits a raw, unfiltered set of actions — one primary (possibly compound) and optional pick-one alternatives. Synthesis owns _all_ substantive action decisions, including thread [status](#thread-status); the one thing it neither sees nor emits is a label. It does not persist the [thread read](#thread-read) itself — after the agent returns, the synthesis processor calls the [autonomy helper](#autonomy-stage) to apply policy and persist.

### Autonomy stage

A deterministic, no-LLM helper (not a pipeline processor) that action-emitting processors call immediately after their LLM step. Per action kind it applies the org's setting (`off` → drop, `suggest` → leave for human, `auto` → execute now + write an [autonomous-action](#autonomous-action) receipt), then persists the surface (`thread.agentRead` or `thread.inlineSuggestions`). [Synthesis](#synthesis) calls it over the raw action set, and what the `auto` actions leave behind is republished rather than cleared — the `suggest` and gated actions survive their siblings' execution, alongside a record of what fired. Pick-one alternatives do not: once any action of the bundle has actually executed, offering an alternative to that bundle would be a lie, so they are dropped. Nothing FrontDesk itself sends — an autonomous reply or one a human accepted — supersedes the read it came from (ADR 0017). The label classifier does not: it evaluates the org's `apply_label` setting against its own confidence locally, then calls `run.executeBundle()` or `run.suggest()` directly — the same policy, applied inline to a single proposal. Auto-mode fires the synthesis primary only; alternatives are never auto-executed.

### Action availability

Whether an action is _able_ to execute at all on this run, given the [organization](#organization)'s [integrations](#integration) and configuration **and** the state of the [thread](#thread) itself — as opposed to whether the org has _permitted_ the Agent to, which is the [autonomy stage](#autonomy-stage)'s job. Availability is resolved before [synthesis](#synthesis) runs and shapes what synthesis is even offered, so the Agent never proposes a move that cannot execute. Most actions self-gate on evidence (no mirrored pull requests, no PR to link); actions that need no evidence, such as issue creation, need an explicit availability rule. Issue creation carries both halves: the org needs a usable default issue target, and the thread must not already link an issue — a thread links a single issue, so a second file can only be refused at execution. Linking an issue stays available on an already-linked thread, since re-linking to a different issue is legal. _Avoid_: describing an unavailable action as "off" — `off` is a deliberate org choice; and treating availability as purely org-scoped.

### Action gate

A per-kind predicate the [autonomy stage](#autonomy-stage) consults before promoting an action to `auto`, asking whether _this particular instance_ has earned autonomous execution. Distinct from [action availability](#action-availability) (_can_ it run) and from autonomy (_is the Agent permitted_ to run it): both of those are properties of the org and the thread, while a gate judges the action's own content. Kinds without a registered gate are promoted unconditionally. A gate runs _after_ per-kind autonomy partitioning, so it can see which sibling actions are actually executing. A failed gate downgrades that one action to `suggest`; it never vetoes its siblings.

Gates that ask about a sibling are evaluated after that sibling's own verdict, and see only siblings _confirmed_ to execute — an unevaluated gate is not a promise.

Two kinds have one: [reply](#grounding), on its grounding, and status, on its [witness](#witness).

### Grounding

A [reply](#action-gate) action's claim about what backs it, and the input to reply's [action gate](#action-gate). One of three classes, each carrying the evidence that justifies it:

- **`documented`** — the cited sources answer the customer's question _as asked_. A source that is merely related, or that answers an adjacent question, is not `documented`; it is `inferred`. Citable sources are those actually retrieved in this [run](#run): the `related_docs` [hint](#read-hint) bag plus anything pulled via the agent's documentation tools.
- **`state_report`** — the reply asserts nothing about the product, only reports thread state the Agent can already see ("we're aware, tracked in #412"). Requires the cited [external issue](#external-issue) / [external pull request](#external-pull-request) to be linked to the thread, or to be linked by a sibling action that is itself executing autonomously.
- **`inferred`** — everything else. Never auto-sends.

Grounding is necessary but not sufficient: an auto-sent reply also needs a **sender**. The Agent has no identity of its own and never authors a message, so an autonomous reply goes out as the thread's assignee — an unassigned thread has nobody to send as, and reply falls back to `suggest`. This is part of reply's gate, not [action availability](#action-availability): a human accepting the read supplies themselves as the sender, so the action remains perfectly executable on an unassigned thread.

Grounding is a _named class_, not a score, and is deliberately not called "confidence": `inlineSuggestion.confidence` is an unrelated 0–1 scalar from the label classifier, and agent reasoning is scrubbed of confidence language before humans read it. Grounding's sources _are_ shown to humans, as citations on the draft. _Avoid_: "confidence" for this concept, "reply score".

### Witness

What justifies finishing a [thread](#thread), and the input to status's [action gate](#action-gate). One of four classes, each carrying its own evidence:

- **`customer_confirmed`** — the customer said so in-thread. Justifies _Resolved_.
- **`entity_settled`** — a linked [external pull request](#external-pull-request) merged, or a linked [external issue](#external-issue) closed, and that settles what was asked. Justifies _Resolved_.
- **`abandoned`** — the thread went quiet: the team replied and the customer never returned. Justifies _Closed_.
- **`inferred`** — everything else. Never finishes a thread on its own.

Deliberately its own noun rather than an extension of [grounding](#grounding), which is a property of a _reply's prose_; a witness is a property of a _state change_. Both are named classes for the same reason: a self-reported score is uncheckable. Resolving additionally requires a reply that is itself sending, so a conversation never ends without the customer hearing about it. _Avoid_: "confidence" (see [grounding](#grounding)), "status score".

### Autonomous action

A receipt of work the Agent performed without human approval. Stored in `autonomousAction`. Carries an undo affordance when the action is reversible by construction.

### Connector

The reusable provider code (Discord, Slack, GitHub) that adapts one external system to FrontDesk. A connector statically **declares** the set of [capabilities](#capability) it provides; the FrontDesk core interacts with those capabilities generically and never references a named provider. Distinct from an [integration](#integration), which is _one org's installed instance_ of a connector. _Avoid_: "provider" or "adapter" as the noun for this (reserve "provider" for the external system's name string, e.g. `provider: "github"`).

### Capability

A role a [connector](#connector) can play, expressed as a typed interface (a bundle of methods) the connector opts into implementing. Planned kinds: support entry point, issue tracker, PR tracker, team notification center. A connector may implement any number of them (GitHub = issue tracker + PR tracker; Slack = support entry point + notification center; Discord = support entry point only). The core asks "does this org have an integration whose connector provides capability X?" rather than naming a provider.

### Integration

One org's installed, configured instance of a [connector](#connector). A row in the `integration` table (`type`, `enabled`, `configStr`), scoped by `organizationId`. "Integration" is the _installed connection_, not the code that powers it (that is the [connector](#connector)) and not the role it plays (that is a [capability](#capability)). Distinct from the [external install](#external-install): `enabled` here is FrontDesk's local switch, not whether the install still exists on the other system.

### External install

The counterpart of an [integration](#integration) on the external system — the GitHub App installation, Slack workspace install, Discord bot membership, etc. FrontDesk does not own it; the external system does. An integration may be `enabled: false` while its external install still exists, or `enabled: true` after the external install has been removed (stale). _Avoid_: calling this "the integration" or saying "integration enabled" when the external side is meant.

### External install liveness

Whether an [integration](#integration)'s [external install](#external-install) still exists and is reachable on the other system. Orthogonal to FrontDesk's `integration.enabled` flag and to any [capability](#capability) the connector provides — it is a property of the install itself, not of issue tracking, notifications, or support entry. The probe answers existence/reachability only (e.g. GitHub: installation still present); it does not validate repository access or broader install usability.

### Developer tooling

### Organization

A FrontDesk tenant and membership boundary. It owns threads, integrations, and configuration; a user gets access through organization membership. _Avoid_: "account" when the tenant is meant.

### Internal API key

A FrontDesk-owned credential that is trusted everywhere, used by internal services and tooling. It never belongs to an [organization](#organization), even when a request made with it acts on one. _Avoid_: "private API key" or "connector key".

### Private API key

An [organization](#organization)'s own secret for authenticating server-to-server requests. It stands for the organization rather than the person who created it, and carries none of an [internal API key](#internal-api-key)'s reach.

**Internal developer**: A workspace user with a verified `@tryfrontdesk.app` email address. An internal developer may use [developer tools](#developer-tool) for any [organization](#organization) they belong to; this does not make them an organization owner. _Avoid_: "admin" as a synonym — ownership and internal status are different concepts.

**Developer tool**: An internal-only surface for inspecting or intentionally exercising FrontDesk behavior. Developer tools are available to internal developers in the organizations where they are members, regardless of deployment environment.

**Developer action**: A named operation exposed by developer tools to exercise or repair a supported workflow for a selected organization or [integration](#integration). Developer actions are explicit commands owned by the developer-tool surface, not [capabilities](#capability): they are not part of the connector's product-role vocabulary and are not discovered dynamically.

**External entity replay**: A [developer action](#developer-action) against an existing mirrored [external issue](#external-issue) or [external pull request](#external-pull-request) that re-fetches current upstream state and re-runs an explicitly selected internal reaction. The first use is replaying PR matching for an existing pull request so the AI pipeline can be exercised without creating a new pull request. It is not a historical webhook replay and does not create or mutate the external entity. _Avoid_: "replay webhook" unless the original payload is actually stored.

**Example dialogue**:

> **Dev**: Can I run the GitHub backfill in production for Acme?
>
> **Domain expert**: Yes, if you are an internal developer and a member of Acme. The action operates through Acme's GitHub integration; it does not grant access to any other organization.

### Thread

The unit of customer conversation in FrontDesk: a single stream of messages carrying its own state (status, labels, assignee) and the surface the Agent reads and acts on. A thread originates from one place — its `externalId` / `externalOrigin` record _where it came from_ (Discord channel, Slack message, portal) — and may **link** to an [external issue](#external-issue) or [external pull request](#external-pull-request) without owning it. Stored in `thread`; the Agent's output for one lives on `thread.agentRead` (see [thread read](#thread-read)).

### Thread status

Where a [thread](#thread) sits in its lifecycle. Two of the five statuses are **live** — _Open_ (nobody has picked it up) and _In progress_ (someone is working it) — and three are **finished**:

- **Resolved** — the conversation reached an answer and **no further update is owed to the customer**. The test is forward-looking, not backward-looking: _will this customer need another update later?_ If yes, the thread is not resolved, however satisfying the last message was. A thread whose answer was "we're aware, tracked in #412" is therefore _not_ resolved — the loop closes only when someone comes back to the customer after #412 is finished.
- **Closed** — the thread did _not_ reach an answer and is not going to: abandoned, withdrawn, out of scope, effectively cancelled. Closed is not a "more final" Resolved; the two differ on _outcome_, not on degree.
- **Duplicated** — the thread is finished because another thread carries it. Reached only by `mark_duplicate`, never chosen directly.

"Finished" is the distinction the system acts on: a finished thread has left the working set.

Finishing a thread is also the one status move that reaches outside FrontDesk: a thread that becomes _Resolved_ or _Closed_ finishes its linked [external issue](#external-issue) too, because both mean the customer's need has been settled one way or the other. _Duplicated_ does **not** — the need moved to another thread rather than being settled, and the issue still tracks it. The sync is **one-way**: un-finishing a thread never reopens the issue upstream, since a customer writing back is not evidence the engineering work regressed.

_Avoid_: treating "closed" as the umbrella for all finished states (that is what "finished" is for); reading the status numbering as a severity or progress ordering (it is a bare enumeration, and "finished" and "syncs upstream" are different subsets of it); and assuming a thread is resolved because its last message reads conclusively — see the forward-looking test above.

### Message direction

Which side of a [thread](#thread) a message came from, derived from its author rather than stored on it. **Inbound** is the customer's side; **outbound** is the organization's. Direction is what decides whether a message is a [trigger](#trigger): only inbound messages cause a run.

Outbound means the author is a **member of the thread's organization** — membership, not merely an authenticated account. A portal customer and a teammate are both rows in the same `user` table, so "has a user id" answers the wrong question and would silence the Agent for any portal participant who did not open the thread.

An author FrontDesk cannot place — a connector-relayed identity, which arrives with an external id and no membership — is **unknown**, and unknown counts as inbound. The two errors are not symmetrical: counting unknown as outbound would silence a colleague of the customer adding real evidence to a thread, invisibly; counting it as inbound means a teammate answering in Discord produces one redundant [thread read](#thread-read), which is visible and self-limiting. The consequence to hold on to is that the causality rule is only enforced for replies sent **through FrontDesk**.

Direction is coarser than the three author roles used to tag a transcript for [synthesis](#synthesis) — _customer_ (the thread's opener), _teammate_, _unknown_ — but it is not a bucketing of them: the roles answer _who is speaking_ and settle the opener as the customer before membership is consulted, so a teammate who opened a thread is tagged _customer_ and is outbound all the same. Direction asks about membership and nothing else. _Avoid_: "agent" for the teammate role — the Agent is the AI, and this concept exists precisely to keep the two apart; "internal/external" (that word is already overloaded, see [flagged ambiguities](#flagged-ambiguities)).

### External issue

An issue in an external developer system (today only GitHub) that FrontDesk **mirrors** read-only. GitHub is authoritative; our copy is a downstream replica updated only from inbound webhooks/backfill, never written canonically from our side. Identified provider-agnostically as `provider:owner/repo#number` (see `formatGitHubId`). A [thread](#thread) may **link** to an external issue; the link is a reference, not ownership. _Avoid_: "GitHub issue" (we are provider-agnostic), "ticket".

### External pull request

A pull request in an external developer system that FrontDesk mirrors under the same read-mirror rules as an [external issue](#external-issue). Distinct from an external issue because it carries PR-only facets (merge state, draft, branches). A thread may link to one. _Avoid_: "PR" alone when ambiguous, "merge request".

### Mirror

FrontDesk's local, read-only replica of authoritative external data ([external issues](#external-issue) and [external pull requests](#external-pull-request)). The external system is the source of truth; the mirror is only ever updated _from_ it (webhooks + backfill + drift reconciliation), never written canonically from our side. Actions taken in FrontDesk go out to the external system and round-trip back into the mirror. Used as a verb ("we mirror the repo's issues") and a noun ("the mirror"). _Avoid_: "cache" (implies disposable/expiry; the mirror is durable and queried as primary), "sync copy".

### Index

A vector index over exactly one kind of entity — threads, messages, documentation chunks, [external pull requests](#external-pull-request), [external issues](#external-issue). Every index answers the same three questions the same way, so they are instantiations of one thing rather than five separate mechanisms:

- **Identity** — which fields name a point, so re-indexing an entity overwrites it in place instead of accumulating a second copy. Never random.
- **Eligibility** — which stored points similarity search may return. Deliberately per-index (see [PR index](#pr-index) against [issue index](#issue-index)); an index that filters nothing still has an eligibility rule, it is just "everything".
- **Freshness** — what keeps the index in step with its source, and which updates are cheap (a payload edit) against which force a re-embed (a content change).

An index is always scoped by [organization](#organization); no caller supplies that filter. An empty search result means _nothing matched_ — a backend failure raises instead, so a caller persisting a [read hint](#read-hint) never mistakes an outage for "no evidence" and clears a valid lead. _Avoid_: "collection" when the concept is meant (that is the storage-level name for one index's backing store).

### PR index

The [index](#index) of mirrored [external pull requests](#external-pull-request), kept in step with the [mirror](#mirror) so PR↔thread similarity can be searched. Its eligibility rule is the strict one: each indexed PR carries an **`eligible`** flag — true only while the PR is _open and non-draft_ — and search filters to eligible PRs. Every mirror write (webhook, backfill, drift reconciliation) refreshes the index; close / convert-to-draft flips `eligible` false, reopen / ready_for_review / content edits refresh it. Indexing is **index-only**: it never enqueues a `pr_matched` [trigger](#trigger). The index feeds two consumers: the push-side match (PR → similar threads) and the pull-side `related_prs` [hint](#read-hint) (thread → similar PRs). A PR is embedded from its _title + body + head ref_.

### Issue index

The [index](#index) of mirrored [external issues](#external-issue), the counterpart to the [PR index](#pr-index). Its **eligibility** rule is deliberately _not_ the PR one: every non-deleted issue is eligible regardless of open/closed state, because a closed issue is often the most useful thing a [thread](#thread) can link to ("this was fixed in #412") and the strongest reason _not_ to file a new one. State travels in the evidence so [synthesis](#synthesis) decides what it means, rather than the index deciding for it.

### Default issue target

The [organization](#organization)-designated sub-resource (e.g. a repository) where **Agent-initiated** issue creation lands. Distinct from the primary [integration](#integration) for the issue-tracker [capability](#capability), which answers _which external system_; this answers _where inside it_. The Agent never chooses the target itself: when no default is set, it falls back to the first available target on the primary tracker (same "first when unset" rule as the primary itself). Issue creation is unavailable to [synthesis](#synthesis) only when no usable target exists. Humans remain free to pick any target, including when accepting an Agent proposal.

### Flagged ambiguities

**"External" is overloaded.** On a thread, `externalId` / `externalOrigin` mean _where the thread itself originated_ (Discord channel, Slack message). This is **not** the same as a linked [external issue](#external-issue) / [external pull request](#external-pull-request), which is a separate developer-system entity the thread points to. When the origin is meant, say "thread origin"; when the linked entity is meant, say "external issue / pull request".
