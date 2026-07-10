# Connector/capability framework for integrations

We are replacing the pattern of one bespoke, provider-named integration app per external system with a **connector/capability framework**: a connector is reusable provider code that statically **declares the capabilities it provides**, and the FrontDesk core interacts with those capabilities generically — it never references a named provider. The four planned capabilities are `support-entry-point`, `issue-tracker`, `pr-tracker`, and `notification-center`; a connector may provide any number of them (GitHub = issue-tracker + pr-tracker; Slack = support-entry-point + notification-center; Discord = support-entry-point only). This dissolves the current coupling where the API hardcodes `type:"github"` orchestration (e.g. `thread.createGithubIssue`) and the connector app is a dumb HTTP proxy.

See [`CONTEXT.md`](../../CONTEXT.md) for the `Connector` / `Capability` / `Integration` glossary terms.

## Status

accepted

## Decisions

- **Capabilities are asymmetric by call direction; every capability has two legs, and they differ only in which leg *defines* it and what the routing key is.**
  - *Emitting* leg (connector → core): the connector pushes normalized data in through a framework-owned ingest API. This defines `support-entry-point`.
  - *Invoked* leg (core → connector): the core calls a declared, typed method interface. This defines `issue-tracker`, `pr-tracker`, `notification-center`.
  - Example of the two legs on one capability: `support-entry-point` emits inbound messages *and* is invoked to deliver replies/status back to the thread's origin; `issue-tracker` is invoked to create/close/link *and* keeps its targets fresh via an inbound webhook→mirror.

- **Capability is not the routing key; the target is.** `hasCapability(org, cap)` and enumeration answer "can we offer this / what targets exist"; a specific invoked call always carries a concrete `integrationId` (or an entity ref that resolves to one). Acting on an existing entity routes via the mirrored entity's owning integration; creating a new entity routes via the chosen sub-resource (a repo belongs to exactly one installation). This is why a capability being one-to-many per org is not ambiguous.

- **Where target-based routing doesn't apply, the org designates a primary integration per capability**, stored in `organization.settings.capabilityPrimary` (org-settings JSON, per the standing preference over config tables). `notification-center` has a single configured target that handles all notifications (no fan-out). Agent-initiated entity *creation* falls back to the primary issue/pr-tracker; humans still pick any target freely.

- **The framework owns normalization.** A high-level ingest API (`ingest({ origin, externalThreadId, externalMessageId, author, body, isBackfill, … })`) owns thread upsert, author identity, origin tracking, dedup, and backfill semantics. A new support-entry-point connector shrinks to "translate provider event ↔ normalized shape" — this is the primary DX win. The outbound mirror of this is a normalized `deliver` interface the framework calls on the origin connector.

- **The mirror is framework substrate, not a capability.** The webhook→`externalEntity` upsert (ADR 0007) is provider-private inbound ingestion that both tracker capabilities rely on to keep their targets fresh.

- **Static declaration, dynamic installation.** A connector ships a static **manifest** (`type`, capabilities, host location) from which the core builds a registry at boot. The `integration` row stays dynamic per-org state: `type` + `enabled` + **opaque** `configStr` (the core forwards config untouched; only the connector interprets it).

## Considered options

- **Uniform capability interface (rejected).** Forcing a single call direction breaks down because `support-entry-point` is inbound-dominant (connector pushes threads in) while the others are outbound-invoked. We embrace the asymmetry instead.
- **Process model — hybrid host + standalone escape hatch (chosen).** A shared connector-host app loads simple connectors as modules (GitHub, future Linear: declare capabilities + method handlers + webhook routes); connectors needing a bespoke long-lived runtime (Discord gateway, Slack bolt) run standalone but implement the same contracts. Rejected: collapsing *everything* into one process (the persistent gateway + bolt + webhooks sharing one blast radius); and keeping N fully standalone apps (no reduction in per-connector ceremony).
- **Invocation transport — standardized HTTP surface (chosen).** Generalizes the status quo (the API already `fetch`es the GitHub app). Rejected: in-process imports (drags `octokit`/`discord.js` into API/worker) and queues (async, wrong for "create issue and return its id").
- **Control plane stays provider-specific (explicit non-goal).** Connect/install/OAuth (GitHub App install, Slack OAuth, Discord invite) and config forms are irreducibly provider-specific and out of scope. "Opaque to core dispatch" ≠ "opaque to the settings UI" — the web settings surface stays provider-aware (e.g. GitHub repo picker) exactly as today. A declarative config-schema for generic form rendering is a possible later nicety, never a generic OAuth flow.

## Consequences

- Connector apps move out of `apps/` into a top-level **`connectors/`** root (host, standalone connectors, and the shared framework package); the Bun/Turbo workspace globs gain `connectors/*`.
- The API's hardcoded provider procedures (`thread.createGithubIssue` and siblings) collapse into a single generic capability-dispatch path.
- **Rollout: retrofit GitHub first.** GitHub proves invoked capabilities + mirror substrate + routing-by-target + the `type:"github"` collapse without touching the two ~1000-line emitting-heavy gateway apps. Discord/Slack migrate later, once the ingest contract is proven against real code.
