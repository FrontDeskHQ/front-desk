# Emitting-side connector retrofit (support-entry-point ingest)

Builds on [ADR-0008](./0008-connector-capability-framework.md), which proved the **invoked** leg (core → connector, HTTP) by retrofitting GitHub. This ADR records the decisions for the **emitting** leg — retrofitting Discord and Slack onto the `support-entry-point` capability — which 0008 deliberately deferred as "a later follow-up, once the ingest contract is proven against real code."

Tracked as a sibling mini-project to FRO-190 (not more children of it): FRO-190 stays "GitHub-first, invoked side, done"; this work depends on it.

## Status

accepted

## Decisions

- **Ingest is a live-state custom mutation procedure, not HTTP.** The two capability legs are genuinely asymmetric: the invoked leg is HTTP because it is core → connector, but ingest is connector → core, where the connectors are already live-state clients. A typed `mutate.ingest(...)` procedure gives the API server-side ownership of normalization while preserving real-time sync and the typed client. Forcing HTTP symmetry on the inbound leg buys nothing real and would stand up a second inbound transport + auth surface.

- **One idempotent `ingest` call; the framework owns create-vs-append.** The connector no longer branches on "is this the first message" (killing the fragile `THREAD_CREATION_THRESHOLD_MS` timing heuristic) and no longer does its own `byExternalId` dedup. `ingest({ thread?, message, author, isBackfill })` is idempotent on `(organizationId, externalThreadId, externalMessageId)`: if no thread exists for the external thread → create using the `thread` descriptor + this message as first; else → append, deduped on `externalMessageId`.

- **The `thread` descriptor is optional; the connector decides when to attach it; the framework hard-errors on a missing thread for an unknown external thread.** Provider-specific "is this a thread root?" logic (Discord thread-name resolution, Slack root detection) stays in the connector. If a message arrives for an external thread the framework doesn't know _and_ carries no thread descriptor, ingest fails loudly rather than silently creating a titleless thread — surfacing connector bugs instead of corrupting data.

- **The framework owns author identity.** Ingest takes a neutral `author: { externalId, name, avatarUrl? }`; the API owns author-row find-or-create/dedup on `(organizationId, metaId)` and the `provider:` prefixing convention. Only the un-liftable provider call — resolving a raw user id → display name (Slack's async API lookup, Discord's `displayName`) — stays in the connector.

- **The deliver leg (outbound) stays pull-based replication, deviating from 0008.** ADR-0008 phrased the outbound mirror as "a normalized `deliver` interface the framework _calls on_ the origin connector" (push). We keep the existing pull model instead: the connector holds a live-state subscription, watches for un-replicated outbound messages/updates, delivers them, and round-trips the external message id. The framework provides a normalized outbound-subscription helper so connectors don't each re-implement the polling. Consequence: `support-entry-point` has two permanent outbound mechanisms relative to the invoked capabilities, and FRO-195's durable dispatch does **not** cover replies. This is a deliberate trade to avoid rewriting the load-bearing `update`/`markReplicated` path and to avoid forcing an invoke HTTP endpoint onto the standalone gateway/bolt apps. **Supersedes the push-deliver implication of ADR-0008 for `support-entry-point`.**

- **Shared connector runtime lifts into a node-only subpath of `@connectors/framework`.** `@connectors/framework` stays dependency-free and browser-safe (the web client imports its manifest for gating, per FRO-194). Node-only runtime scaffolding — live-state client bootstrap, redis/BullMQ queue factory, feature-flag client, backfill orchestration, portal-URL builder, integration-settings parsing, and the outbound-subscription helper — lifts into a `@connectors/framework/runtime` subpath export. Browser safety is preserved by the export map (browser imports only `.`); a whole separate package would add ceremony for no gain.

- **`notification-center` is out of scope.** It is a different theme (a brand-new invoked capability, the first invoke HTTP endpoint on a standalone connector, and formalizing the digest path) and is deferred to its own follow-up — same discipline that kept FRO-190 GitHub-first.

## Consequences

- Discord and Slack shrink to "translate provider event ↔ normalized ingest args"; the ingest/dedup/identity logic centralizes in the API.
- The deprecated `thread.discordChannelId` column is dropped: ingest stops writing it, and the pull-deliver path migrates its channel-lookup reads to `externalId` (guarded by `externalOrigin`).
- Backfill jobs stay in the connectors (integration apps own their jobs) but route through the same `mutate.ingest(..., isBackfill: true)`; `isBackfill` only suppresses downstream pipeline triggers.
- Inbound status (Discord archived → thread closed) stays a plain generic `thread.setStatus({ source })` mutation — already provider-neutral, not folded into ingest.
- Rollout: (1) ingest contract + Discord tracer bullet, (2) Slack onto ingest, (3) runtime scaffolding lift, (4) drop `discordChannelId`.
