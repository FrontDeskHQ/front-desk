# Plan: make all issue/PR surfaces read the reactive `externalEntity` mirror

## Goal

Every client surface that shows a GitHub issue or PR should render **live data read reactively from the org-scoped `externalEntity` mirror** (via `useLiveQuery`), rather than from values baked into a URL, a thread field, or an event's `metadataStr` snapshot. After this, the link sidebar, inline markdown chips, and the activity feed all stay current when an issue/PR title or state changes upstream — no refetch, no stale snapshot.

## Background / current state

- The mirror is `schema.externalEntity`, org-scoped, one row per issue/PR, identified by `(organizationId, externalKey)`.
- `externalKey` format is **`github:<owner>/<repo>#<githubInternalId>`** — see `packages/schemas/src/external-issue.ts:formatGitHubId`. **Important:** the trailing number is GitHub's internal database `id`, **not** the human-visible issue/PR `number` that appears in URLs (`/pull/123`). Surfaces that only have a URL therefore cannot reconstruct the `externalKey`; they must look the row up by `(organizationId, type, repoFullName, number)`.
- Thread links store the `externalKey` reference in `thread.externalIssueId` / `thread.externalPrId` (reactive references — good, keep).
- Already reactive (done in FRO-185): `components/threads/issues.tsx` and `components/threads/pull-requests.tsx` read the mirror via `query.externalEntity.where({ ... })`.

## Surfaces still baking/storing data

| # | Surface | Today | Target |
| --- | --- | --- | --- |
| 1 | `components/chips.tsx` → `PrChip` | static `owner/repo #number` parsed from URL; no title/state (see TODO at `chips.tsx:174`) | reactive lookup of mirror row → show title + state in a hover card, mirroring `ThreadChipWithSummary` |
| 2 | `components/markdown/rich-markdown.tsx` → `PrChipInline` + `parseGithubPrUrl` | passes only URL-parsed `owner/repo/number/url` | resolve the mirror row and enrich the chip |
| 3 | `components/markdown/tiptap-link-renderer.tsx` | same URL-only `PrChipInline` path | inherits the enrichment from #1/#2 |
| 4 | `components/threads/updates.tsx` | renders baked `oldIssueLabel`/`newIssueLabel`/`issueLabel`/`oldPrLabel`/`newPrLabel` from `update.metadataStr` | resolve the current label from the mirror by the stored `externalKey`, with the baked label as fallback for deleted entities |
| 5 | issue links in markdown (none today) | only PRs get chips | _(optional)_ add an `IssueChip` with the same reactive lookup |

## Implementation

### Step 1 — shared reactive lookup hooks

Add to `components/threads/external-entities.ts` (already the shared module):

- `useMirrorEntityByKey(externalKey: string | null)` — `useLiveQuery( query.externalEntity.first({ organizationId, externalKey }))`. For surfaces that hold the `externalKey` (thread links, update events).
- `useMirrorEntityByRef({ type, repoFullName, number })` — `useLiveQuery(query.externalEntity.first({ organizationId, type, repoFullName, number, deletedAt: null }))`. For URL-derived surfaces (chips) that only know `owner/repo` + `number`. `repoFullName = \`${owner}/${repo}\``.

Both pull `organizationId` from `activeOrganizationAtom`. Return the `MirrorEntity` subset (extend the type with `state`/`url` as needed).

### Step 2 — enrich `PrChip` / `PrChipInline` (surfaces 1–3)

- In `PrChip`, call `useMirrorEntityByRef({ type: "pull_request", repoFullName, number })`.
  - When a row resolves: render title + a state indicator (open / closed / merged / draft from `state` + `merged`), wrapped in a hover card like `ThreadSummaryHoverCard`.
  - When no row (entity not mirrored, e.g. external repo / not yet synced): fall back to today's static `owner/repo #number` link. No regression.
- Remove the `chips.tsx:174` TODO once done.
- `PrChipInline` and `tiptap-link-renderer.tsx` need no change beyond passing through — the data fetch lives inside `PrChip`.
- Keep the chip a client component; these already render under an authed, org-scoped tree where the mirror is synced (`routes/app/route.tsx` includes `externalEntities`). Guard for `organizationId == null` (portal/public contexts) → static fallback.

### Step 3 — reactive labels in the activity feed (surface 4)

- The link mutations in `issues.tsx` / `pull-requests.tsx` already store `oldIssueId`/`newIssueId` (the `externalKey`s) in `metadataStr` alongside the baked labels. Keep writing the labels (cheap, and the fallback for deleted entities), but at render time in `updates.tsx`:
  - For each id present, call `useMirrorEntityByKey(id)` and prefer the live `\`${repoFullName}#${number}\`` (or title) over the baked label.
  - Fall back to the stored label when the mirror has no row (entity deleted or never synced) — historical events must still read sensibly.
- Note hook-in-loop constraints: resolve a small fixed set of ids (old/new) with individual hooks or a single `where({ externalKey: { in: [...] }})` query if live-state supports it; otherwise a tiny child component per id.

### Step 4 — (optional) issue chips in markdown (surface 5)

- Add `parseGithubIssueUrl` (sibling of `parseGithubPrUrl`) and an `IssueChip` using `useMirrorEntityByRef({ type: "issue", ... })`. Wire into the `a` renderer in `rich-markdown.tsx` and `tiptap-link-renderer.tsx`. Defer unless in scope.

## Explicitly out of scope / keep as-is

- `thread.externalIssueId` / `externalPrId` — already reactive references; keep.
- `createGithubIssue` optimistic placeholder in `issues.tsx` — transient UI that is dropped once the webhook upsert lands the real row; keep.
- `integration.configStr.repos` (repo picker source) — integration config, not entity data; keep.
- Stubbed suggestion surfaces (`linked-pr-suggestions-section.tsx`, `quick-actions.tsx`, `support-intelligence.tsx`) — owned by signals-overhaul issue 10; not part of this work.
- Landing-page / onboarding copy — static marketing, not data surfaces.

## Verification

- `bun run --filter web typecheck` and `bun run --filter web lint` clean.
- Manually: link a PR/issue to a thread, then change its title/state on GitHub (or via the dev `Devtools › GitHub › Sync issues & PRs` backfill) and confirm the chip, hover card, and any activity-feed label update without reload.
- Confirm static fallback still renders for a PR URL from a repo that isn't mirrored.
