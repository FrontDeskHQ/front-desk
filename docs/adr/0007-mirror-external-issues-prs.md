# Mirror external issues/PRs as a fully client-synced, read-only replica

We mirror all issues and pull requests from the repos selected in an org's GitHub integration into a single, org-scoped `externalEntity` table, kept current by GitHub webhooks (live upserts), an initial backfill, and a periodic drift reconciliation. GitHub stays authoritative: the mirror is never written canonically from our side — actions taken in FrontDesk go out to the GitHub API and round-trip back into the mirror via webhook; optimistic UI stays client-only. This replaces the previous on-demand fetch-from-GitHub approach so we can display and search issue/PR data effectively.

## Status

accepted

## Considered options

- **Read-mirror with GitHub round-trip (chosen).** One writer per field (inbound only), so "authoritative" is literally true and the mirror can't diverge.
- **Bidirectional / optimistically-written mirror.** Rejected: two writers per field invites divergence and reconciliation complexity for no product gain at this stage.
- **Server-side mirror queried via procedures (no client sync).** Rejected for now: structured search and reactive thread updates are simpler client-side, and we accept the footprint bet below.

## Consequences

- The mirror is **fully Live-State-synced to clients**, deliberately deviating from the established "ingestion tables aren't synced to clients" precedent (`apps/api/src/live-state/schema.ts`). At current scale the reactive/offline UX wins, and Live-State is expected to gain native data slicing before mirror volume becomes a problem. If volume bites before then, the fallback is a server-side query path for the browse/search corpus.
- Backfill and drift reconciliation run as **BullMQ jobs inside the github integration app** (not the central `apps/worker`), which owns its own background work.
- A created/edited issue is not visible in the mirror until its webhook lands (usually sub-second); UI bridges the gap optimistically.
- Removals are **soft-deleted** (`deletedAt`) so linked-thread history never dangles.
