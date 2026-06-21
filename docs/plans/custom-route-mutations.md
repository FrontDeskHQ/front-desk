# Plan: Custom Route Procedures

## Goal

Migrate the existing `apps/api` Live-State route surface so write behavior is exposed through explicit procedures using `withProcedures`. Generic collection `insert` and `update` writes should not remain as the primary application write API for any call site.

All known callers must move to the replacement procedures. When a custom procedure is used by `apps/web`, add or update the matching optimistic mutation in the web Live-State client so user-facing writes keep the current responsive behavior. Non-web callers should migrate to procedures but should not receive optimistic mutation work. The end state should make every write path auditable by name, preserve authorization checks, and keep web rollback behavior predictable.

## Operating Instructions

- Treat "custom migrations" in the kickoff request as custom procedures implemented with `withProcedures`.
- Keep API write semantics equivalent unless an existing route is already unsafe or ambiguous; record behavior changes in `Decisions`.
- Do not remove generic writes until the replacement custom procedure and all known call sites across the repository have been migrated.
- For every web-used custom procedure, decide explicitly whether it needs an optimistic mutation in `apps/web/src/lib/live-state.ts`; record intentional omissions.
- Do not add optimistic mutation work for non-web callers; they only need to move to the procedure API.
- Keep work in small route-family slices so each PR can be reviewed without understanding the entire router at once.
- **One PR = one slice id** below (`LP-003b`, `LP-005a`, …). Do not combine slices unless the user explicitly expands scope.
- A slice is done when its completion criterion holds, typecheck passes for affected apps, and ripgrep shows no leftover generic writes for that slice's scope.
- **Lockdown slices** (`*-lockdown`) ship only after every caller for that route family is migrated in prior slices.
- Bundle `withMutations` → `withProcedures` renames with the first slice that touches that route file.

## Current State

- Status: in-progress
- Active checkpoint: **LP-003b** (next PR slice)
- Branch or PR: none
- Last updated: 2026-06-21

LP-001 inventory is complete below. API routes live in `apps/api/src/live-state/router.ts` and `apps/api/src/live-state/router/*.ts`. Several families already expose custom procedures but still use `withMutations` instead of `withProcedures`; `thread`, `message`, `label`, and `autonomousAction` already use `withProcedures`. Web writes use both `mutate.*` (synced client) and `fetchClient.mutate.*` (HTTP); optimistic handlers are centralized in `apps/web/src/lib/live-state.ts`.

**LP-003 progress:** Shared thread write helpers live in `apps/api/src/lib/thread-mutations.ts`. Implemented `thread.setStatus`, `thread.setPriority`, `thread.assignUser` (API procedures + web migration + optimistic handlers). `set-status` signal handler now calls `runSetThreadStatus`. Remaining LP-003 work: GitHub link/unlink, `markDuplicate`, `archive`/`restore`, `setAgentRead`, slack/discord `thread.create` / generic `message.insert`, and other generic `thread.update` call sites (`issues.tsx`, `pull-requests.tsx`, archive route, devtools).

## Write inventory matrix

Legend:

- **Generic insert/update**: collection-route default mutators.
- **Procedure API**: custom named writes (`withProcedures` or legacy `withMutations`).
- **Web**: `apps/web` call sites only.
- **Optimistic**: handler in `apps/web/src/lib/live-state.ts` (`yes` / `no` / `n/a`).

### Product routes (migrate generic writes off the primary API)

| Route | Generic insert | Generic update | Procedure API (current) | Non-web call sites | Web call sites | Web optimistic |
| --- | --- | --- | --- | --- | --- | --- |
| `thread` | yes (org member, portal, internal key) | yes (org member session, internal key) | `withProcedures`: `create`, `setStatus`✓, `setPriority`✓, `assignUser`✓, `list`†, `fetchRelatedThreads`†, `fetchGithubIssues`†, `fetchGithubPullRequests`†, `createGithubIssue`, `executeAutonomousBundle`, `acceptRead`, `dismissRead`, `acceptInlineSuggestion`, `dismissInlineSuggestion`, `upsertInlineSuggestion`, `writeHintSlot` | **Generic** `insert`: `apps/slack`, `apps/discord` (`store.mutate`). **Generic** `update`: `apps/slack`, `apps/discord`, `apps/github` webhooks (`store.mutate` / `fetchClient`), `apps/worker` `agent-read.ts`. **Procedures**: `apps/worker` `apply-synthesis-autonomy.ts` (`executeAutonomousBundle`), `read-hints.ts` (`writeHintSlot`), `inline-suggestions.ts` (`upsertInlineSuggestion`). **API-internal** `db.thread.update`: signal handlers (`close`, `set-status`, `mark-duplicate`, `reply` path), `autonomous-action` `undo`, `thread-procedures.ts`, `afterInsert` shortId hook. | **Generic** `update`: `actions/threads.ts` (priority/assign migrated), `issues.tsx`, `pull-requests.tsx`, `threads/$id/index.tsx`, `archive/$id.tsx`, devtools `create-thread-button.tsx` (`insert`). **Procedures**: `create-thread-dialog.tsx`, devtools `create-thread-dialog.tsx`, `cli` `thread/create`, `issues.tsx` (`createGithubIssue`), `support-related-threads-section.tsx` (`fetchRelatedThreads`), `signals/action-row/handlers.ts` (read + inline suggestion accept/dismiss); `properties.tsx`, `quick-actions.tsx` (status accept), command palette, toolbar resolve (`setStatus`/`setPriority`/`assignUser`). | **Partial** — optimistic for `acceptRead`, `dismissRead`, `acceptInlineSuggestion`, `dismissInlineSuggestion`, `setStatus`, `setPriority`, `assignUser`. **Missing** for generic `thread.update` (issues/PR/archive), `create`, `createGithubIssue`, `markDuplicate`. |
| `message` | yes (org member, portal, public key) | internal key only | `withProcedures`: `create`, `markAsAnswer`, `search`† | **Generic** `insert`/`update`: `apps/slack`, `apps/discord` (`store.mutate`). **API-internal** `db.message.insert`: signal handler `reply.ts`, `agent-chat` `acceptDraft`. | `reply-editor.tsx` (`create`), portal `support/$slug/threads/$id.tsx` (`create`, `markAsAnswer`), `search/index.tsx` (`search`), devtools `duplicate-thread-command.tsx` / `create-thread-button.tsx` (generic `insert`), `thread-reply.tsx` (`markAsAnswer`). | **Partial** — `create`, `markAsAnswer` yes. Generic `insert` (devtools) no. |
| `update` | yes (org member session) | yes (org member + internal key) | none | **Generic** `insert`: `apps/github` webhooks (`store.mutate`). **Generic** `update`: `apps/slack`, `apps/discord` (`fetchClient`). **API-internal** `db.insert(schema.update)`: `threads` `createGithubIssue`, `autonomous-action` `undo`, `signals/activity.ts`, thread inline-suggestion procedures. | Paired with almost every `thread.update` in `actions/threads.ts`, `properties.tsx`, `quick-actions.tsx`, `issues.tsx`, `pull-requests.tsx`. | **No** (except side effects inside `autonomousAction.undo` optimistic). |
| `label` | disabled | disabled | `withProcedures`: `create`, `update`, `createAndAttachToThread`, `attachToThread`, `detachFromThread` | **API-internal** `db.label` / `db.threadLabel`: signal handler `apply-label.ts`, `autonomous-action` `undo`. | `labels.tsx` (thread UI), `labels.tsx` (settings), `quick-actions.tsx` (`attachToThread`). | **Yes** — all five procedures. |
| `threadLabel` | disabled | disabled | none (writes only via `label.*` procedures) | **API-internal**: `apply-label.ts`, `autonomous-action` `undo`. | none direct | n/a |
| `author` | yes (session/portal/internal key) | internal key only | none | `apps/slack`, `apps/discord` (`author.insert`). Created inside `thread.create`, `message.create`, `agent-chat` `acceptDraft`, signal `reply.ts`. | devtools `create-thread-button.tsx` (generic `insert`). | **No** (author rows optimistically created only as side effect of `message.create`). |
| `organization` | disabled | owner or internal key | `withMutations`: `create`, `setActionAutonomy`, `createPublicApiKey`, `revokePublicApiKey`, `listApiKeys`† | Boot migration `002_seed_autonomy_settings.ts` (`db.organization.update`). `organization.create` also inserts `subscription` + `organizationUser` server-side. | `onboarding/connect.tsx` (`create`), settings `index.tsx` + `support-intelligence.tsx` (generic `update`, `setActionAutonomy`), `api-keys.tsx` (key procedures). | **No** |
| `organizationUser` | disabled | owner or internal key | `withMutations`: `inviteUser` | Created by `invite.accept`, `organization.create`. | `team.tsx` (generic `update`, `inviteUser`). | **No** |
| `user` | disabled | self or internal key | none | none | `settings/user/index.tsx` (generic `update`). | **No** |
| `invite` | disabled | org members | `withMutations`: `accept`, `decline` | `inviteUser` creates rows; `accept` also inserts `organizationUser` + `allowlist`. | `invitation.$id.tsx` (`accept`, `decline`), `onboarding/index.tsx` (`accept`), `team.tsx` (generic `update` revoke). | **No** |
| `integration` | owner or internal key | owner or internal key | `withMutations`: `fetchSlackChannels`† | `apps/slack` (`installation-store`, `utils`), `apps/discord` (`utils`), `apps/github` (`setup.ts`, settings flows via web). | Settings + redirect routes for slack/discord/github, `lib/integrations/activate.ts`, `organization/index.tsx` (`fetchSlackChannels`). | **No** |
| `onboarding` | org members + internal key | org members + internal key | `withMutations`: `initialize`, `completeStep`, `skip`, `complete` | none | `use-onboarding.ts` (all four procedures; `initialize` via `fetchClient`). | **No** |
| `documentationSource` | internal key only | internal key only | `withMutations`: `validateDocumentationSource`†, `addDocumentationSource`, `recrawlDocumentationSource`, `deleteDocumentationSource` | `apps/worker` `crawl-documentation.ts` (generic `update` via internal key). | `settings/organization/documentation.tsx` (all custom procedures). | **No** |
| `externalEntity` | disabled | disabled | `withMutations`: `upsert`, `softDelete`, `syncFromGithub`† | `apps/github` `external-entity.ts` (`upsert`), `jobs/reconcile.ts` + webhooks (`softDelete`). | devtools `github-submenu.tsx` (`syncFromGithub`, dev-only). | **No** |
| `agentChat` | disabled | disabled | `withMutations`: `create`, `sendMessage`, `acceptDraft`, `dismissDraft`, `updateDraft` | `agentChatMessage` rows written inside `sendMessage` / streaming handlers. | `support-intelligence-chat.tsx`, playground `index.tsx`. | **No** |
| `agentChatMessage` | disabled | disabled | none (written by `agentChat.sendMessage` / server stream) | same as above | none direct | n/a |
| `autonomousAction` | disabled | disabled | `withProcedures`: `record`, `undo`, `seedFake`†, `clearFake`† | **API-internal** `db.autonomousAction.insert`: `signals/autonomous-receipts.ts` (bypasses `record` procedure). `apps/worker` uses `thread.executeAutonomousBundle` instead of `record` directly. | devtools `signals-submenu.tsx` (`seedFake`, `clearFake`). **No web caller for `undo` yet** despite optimistic handler. | **Partial** — `undo` handler exists, no UI caller. |

† = read/query or dev-only; not a product write path but listed for completeness.

### Internal-only routes (documented exceptions — keep generic or direct DB)

| Route | Generic insert | Generic update | Call sites | Notes |
| --- | --- | --- | --- | --- |
| `pipelineIdempotencyKey` | internal key | internal key | `apps/worker` `pipeline/core/idempotency.ts` | Worker bookkeeping |
| `pipelineJob` | internal key | internal key | `apps/worker` `pipeline/core/persistence.ts` | Worker bookkeeping |
| `allowlist` | internal key | internal key | `invite.accept` procedure (`db.insert`) | Side effect of invite flow |
| `subscription` | disabled | internal key | `organization.create`; `apps/api/src/index.ts` Dodo webhook (`storage.update` direct) | Billing webhook bypasses Live-State client |
| `migration` | disabled | disabled | `apps/api/src/live-state/migrations/index.ts` | Boot-time runner only |

### API-internal writes (not Live-State client mutations)

These run inside the API process via `db.*` and must be accounted for when locking generic writes or adding procedures:

| Area | Tables touched | Entry points |
| --- | --- | --- |
| Signal action handlers | `thread`, `message`, `author`, `threadLabel`, `update` | `apps/api/src/lib/signals/handlers/*.ts`, `activity.ts` |
| Signal thread procedures | `thread` | `apps/api/src/lib/signals/thread-procedures.ts` (used by `thread.*` procedures) |
| Autonomous receipts | `autonomousAction` | `apps/api/src/lib/signals/autonomous-receipts.ts` — should migrate to `autonomousAction.record` |
| Agent chat streaming | `agentChat`, `agentChatMessage`, `message`, `author` | `apps/api/src/live-state/router/agent-chat.ts` handlers |
| Boot migrations | `thread`, `organization`, … | `apps/api/src/live-state/migrations/files/*.ts` |

### Cross-cutting web patterns (generic writes to replace)

1. **`thread.update` + `update.insert` pairs** — status, priority, assignment, PR link/unlink, duplicate mark, archive restore. Central helpers in `apps/web/src/actions/threads.ts`; also inline in `properties.tsx`, `quick-actions.tsx`, `issues.tsx`, `pull-requests.tsx`.
2. **`integration.insert` / `integration.update`** — OAuth connect flows across slack, discord, github settings and `lib/integrations/activate.ts`.
3. **Devtools generic inserts** — `thread.insert`, `message.insert`, `author.insert` in `create-thread-button.tsx` and `duplicate-thread-command.tsx` (should use `thread.create` / `message.create`).
4. **Integration bots** — slack/discord still use generic `thread.insert` / `message.insert` / `message.update` via synced `store.mutate` (see `threads.ts` `afterInsert` shortId hook TODO).

### Optimistic mutation coverage summary (`apps/web/src/lib/live-state.ts`)

| Resource | Procedures with optimistic handler | Intentional gap / notes |
| --- | --- | --- |
| `message` | `create`, `markAsAnswer` | Generic `insert` used only in devtools |
| `label` | all five write procedures | Complete |
| `thread` | `acceptRead`, `dismissRead`, `acceptInlineSuggestion`, `dismissInlineSuggestion`, `setStatus`, `setPriority`, `assignUser` | Generic `thread.update` remains for issues/PR/archive; `create` also lacks optimistic UI |
| `autonomousAction` | `undo` | Handler ready; no web caller wired yet |
| All other routes | none | Settings/onboarding/integration writes are mostly `fetchClient` or infrequent — assess per procedure in LP-002 |

## Target procedure contract (LP-002)

Authoritative implementation habits also live in `agents/saved-prompts/update-routers.md`. This section is the migration contract for this project.

### API primitive

- Declare custom writes and reads with **`withProcedures`** (`mutation` / `query`). Do not add new `withMutations` routes.
- When touching a legacy `withMutations` route during LP-003–LP-007, rename the builder to `withProcedures` in the same PR (procedure names stay stable).
- **Queries** (`list`, `search`, `fetchRelatedThreads`, …) are out of migration scope unless a generic write is being replaced; they may remain as-is.

### Naming

| Rule | Example |
| --- | --- |
| Use a **verb** that names the product operation, not the SQL shape | `create`, `setStatus`, `attachToThread`, `upsert`, `record` |
| Prefer **one procedure per real operation** — no UI-side branching that the server already owns | `attachToThread` resolves natural keys; clients do not `insert` + `update` pairs |
| Put the procedure on the collection that owns the **product concept**, even when other tables are touched | label attach/detach live on `label.*`; timeline rows are a side effect of `thread.*` |
| Use **paired, consistent names** for inverse operations | `attachToThread` / `detachFromThread`; `linkGithubIssue` / `unlinkGithubIssue` |
| Avoid generic `update` as a procedure name when a specific verb exists | `setStatus` not `updateThread` with a status field |
| Integration / worker entry points get the **same procedure** as web when the operation is identical | slack/discord thread ingestion calls `thread.create`, not `thread.insert` |

**Reserved names (already in use — do not overload):** `create`, `record`, `undo`, `upsert`, `softDelete`, `accept`, `decline`, `inviteUser`, `initialize`, `completeStep`, `skip`, `complete`, `sendMessage`, `acceptDraft`, `dismissDraft`, `updateDraft`.

### Input schemas

- Every procedure takes a **Zod object** as its input schema.
- **Updates** take stable identifiers (`threadId`, `labelId`, …) plus only the fields that change. Do not accept arbitrary collection patches from clients.
- **Creates** accept the minimum fields needed to construct the row(s). Optional `id` / `threadLabelId` / similar may be supplied for optimistic client reconciliation; server ignores client `id` when upserting by natural key.
- Reuse shared Zod fragments when the same field bundle appears in multiple procedures (see `externalEntityFields` in `external-entity.ts`).
- Coerce dates with `z.coerce.date()` where clients may send ISO strings.
- Throw **stable string error codes** (`UNAUTHORIZED`, `THREAD_NOT_FOUND`, `LABEL_NOT_FOUND`, …) — match existing handlers.

### Authorization

- Inside handlers, call **`authorize(req, { organizationId, role?, allowPublicApiKey?, allowInternalApiKey? })`** with the mutation/query `req`. Use `isAuthorized(ctx, opts)` only when a boolean guard is needed without throwing.
- Resolve `organizationId` from the target row when it is not in input (load entity → `authorize` → mutate).
- **Portal**, **public API key**, and **internal API key** flows follow the `thread.create` / `message.create` pattern: explicit context checks where `authorize` alone is insufficient (portal userId match, public key ownerId, etc.).
- Collection-route **`insert` / `update` (pre/post)** become **deny-by-default** (`() => false` or equivalent) once all product and integration callers for that resource are migrated. Until then, keep existing permissions so parallel migration does not break callers.
- Procedure-level auth must be **at least as strict** as the generic mutator it replaces.

### Return values

- **Creates:** return the inserted row (or included graph) when the caller needs it for navigation or optimistic reconciliation. `db.*.insert` usually returns the row — avoid an extra `one(id).get()` unless `include` is required.
- **Updates:** return the updated row after mutation when clients read the result; otherwise return a minimal ack (`{ ok: true }`, `{ id, alreadyExists: true }`).
- **Side-effect-only** procedures (e.g. `record` on `autonomousAction`) return the written row or a stable id for undo flows.
- Do not return secrets or internal-only fields beyond what sync already exposes.

### Shared server logic

- Factor insert/update paths into helpers that accept **`db` or transaction `trx`** so procedures, signal handlers, and agent-chat code reuse one implementation.
- **API-internal `db.*` writes** (signal handlers, `autonomous-receipts.ts`, agent-chat streaming, boot migrations) must either call those shared helpers or gain a tracked exception in this ledger. Goal: no duplicate business rules between procedures and signal handlers.
- Signal handlers that today do `thread.update` + `insertThreadActivity` should converge on the same helper used by the matching `thread.*` procedure (LP-003 / LP-004).

### Client migration

- Replace **`mutate.<resource>.insert|update`** and **`fetchClient.mutate.*` / `store.mutate.*`** with **`mutate.<resource>.<procedure>(input)`** everywhere in the repo.
- **Preserve await behavior:** if the original call was fire-and-forget, keep it fire-and-forget; if it was awaited, keep await.
- Devtools and integration bots are not exempt — they migrate in the same route-family PR.

### Optimistic mutations (web only)

Add a handler in `apps/web/src/lib/live-state.ts` when **all** of the following are true:

1. The UI calls the procedure via synced **`mutate.*`** (not only `fetchClient`).
2. The call is **fire-and-forget** or must feel instant (inbox, thread header, composer, label chips).
3. The optimistic patch can **mirror server semantics** on local `storage` without guessing server-only fields.

**Do not add optimistic handlers when:**

- The caller always uses **`fetchClient`** and awaits (settings, onboarding, OAuth redirects, documentation crawl).
- The procedure is **dev-only** or **worker/integration-only**.
- The write is **idempotent background sync** (external entity upsert, pipeline tables).
- Correct rollback requires **server-computed fields** the client cannot derive (e.g. billing subscription state).

**Implementation rules:**

- Handler shape: `defineOptimisticMutations<Router, typeof schema>({ resource: { procedure: ({ input, storage }) => { … } } })`.
- Touch the **same collections** in the **same order** as the server procedure.
- Side-effect rows (`author` on `message.create`, `update` on `autonomousAction.undo`) belong inside the owning procedure's optimistic handler.
- Record every **intentional omission** in the matrix above when adding a new procedure.

### Generic write lockdown (LP-008 target)

| Category | Routes | Generic `insert` / `update` after LP-008 |
| --- | --- | --- |
| **Product — disabled** | `thread`, `message`, `update`, `author`, `organization`, `organizationUser`, `user`, `invite`, `integration`, `onboarding`, `documentationSource`, `label`, `threadLabel`, `externalEntity`, `agentChat`, `agentChatMessage`, `autonomousAction` | `false` / deny; all writes via procedures |
| **Internal-only — keep restricted** | `pipelineIdempotencyKey`, `pipelineJob` | internal API key only |
| **Internal-only — side effects** | `allowlist` | internal key; rows created inside `invite.accept` |
| **Internal-only — billing** | `subscription` | internal key; Dodo webhook may keep direct `storage.update` (documented exception) |
| **Boot-only** | `migration` | disabled; migrations runner only |

### Planned procedure catalog (by migration slice)

Procedures **already implemented** are marked ✓. Others are the LP-003–LP-007 target names — adjust only with a `Decisions` entry.

#### LP-003: `thread`, `message`, `author`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| `create` ✓ | `thread` | generic `thread.insert` (web devtools, slack, discord) | **yes** — high-traffic; mirror `message.create` author+message graph |
| `setStatus` ✓ | `thread` | generic `thread.update` status + `update.insert` status_changed | **yes** ✓ |
| `setPriority` ✓ | `thread` | generic `thread.update` priority + `update.insert` priority_changed | **yes** ✓ |
| `assignUser` ✓ | `thread` | generic `thread.update` assignedUserId + `update.insert` assigned_changed | **yes** ✓ |
| `linkGithubIssue` / `unlinkGithubIssue` | `thread` | generic `thread.update` externalIssueId + paired `update.insert` | **yes** |
| `linkGithubPullRequest` / `unlinkGithubPullRequest` | `thread` | generic `thread.update` externalPrId + paired `update.insert` | **yes** |
| `markDuplicate` | `thread` | generic `thread.update` status duplicate + activity | **yes** (low traffic) |
| `archive` / `restore` | `thread` | generic `thread.update` deletedAt / status | **yes** for archive path |
| `setAgentRead` | `thread` | generic `thread.update` agentRead (worker `agent-read.ts`) | **no** — worker-only |
| `create` ✓ | `message` | generic `message.insert` (slack, discord, devtools) | ✓ already |
| `markAsAnswer` ✓ | `message` | — | ✓ already |
| — | `author` | generic `author.insert` | **no** — always created inside `thread.create` / `message.create`; block generic insert |

#### LP-004: `update`, `label`, `threadLabel`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| (thread procedures above own timeline inserts) | `update` | generic `update.insert` from web + github webhook | **n/a** — product callers stop inserting directly |
| `recordActivity` | `update` | any remaining **internal** timeline writes that are not part of a thread procedure | **no** |
| `create` / `update` / `attachToThread` / … ✓ | `label` | — | ✓ already |
| — | `threadLabel` | direct writes | remain blocked; only via `label.*` |

#### LP-005: `organization`, `organizationUser`, `user`, `invite`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| `create` ✓ | `organization` | — | **no** — onboarding uses `fetchClient`, awaited |
| `updateSettings` | `organization` | generic `organization.update` (support URL, name, …) | **no** |
| `setActionAutonomy` ✓ | `organization` | — | **no** |
| `createPublicApiKey` / `revokePublicApiKey` ✓ | `organization` | — | **no** |
| `inviteUser` ✓ | `organizationUser` | — | **no** |
| `updateMember` | `organizationUser` | generic `organizationUser.update` (role, enabled) | **no** |
| `updateProfile` | `user` | generic `user.update` | **no** |
| `accept` / `decline` ✓ | `invite` | — | **no** |
| `revoke` | `invite` | generic `invite.update` revoke | **no** |

#### LP-006: `integration`, `externalEntity`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| `connectInstallation` | `integration` | generic `integration.insert` (slack/discord/github) | **no** — OAuth / `fetchClient` |
| `updateInstallation` | `integration` | generic `integration.update` | **no** |
| `fetchSlackChannels` ✓ (query) | `integration` | — | — |
| `upsert` / `softDelete` ✓ | `externalEntity` | — | **no** |
| `syncFromGithub` ✓ (query) | `externalEntity` | — | — |

#### LP-007: `onboarding`, `documentationSource`, `agentChat`, `autonomousAction`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| `initialize` / `completeStep` / `skip` / `complete` ✓ | `onboarding` | generic `onboarding.insert` / `update` | **no** — `fetchClient` |
| `addDocumentationSource` / … ✓ | `documentationSource` | generic `update` in worker crawl | **no** |
| `create` / `sendMessage` / draft procedures ✓ | `agentChat` | — | **no** — streamed server state |
| `record` ✓ | `autonomousAction` | `db.autonomousAction.insert` in `autonomous-receipts.ts` | **no** |
| `undo` ✓ | `autonomousAction` | — | ✓ handler exists; wire UI or drop handler in LP-009 if still unused |

### Verification expectations (per migration PR)

1. `bun run typecheck` (root or affected apps).
2. Ripgrep: no remaining `mutate.<resource>.insert` / `.update` for the migrated resource under `apps/`.
3. Generic mutator disabled on that route when the checklist item says so.
4. Web: exercise or manually smoke the touched UI paths; note gaps in `Verification Ledger`.

## PR slices (one PR per row)

Parent checklist items (`LP-003`–`LP-009`) complete when all child slices under them are checked. Slices are ordered by dependency where it matters; otherwise they can ship in parallel.

### LP-003 — `thread`, `message`, `author`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-003a** | `thread.setStatus` / `setPriority` / `assignUser` | `thread-mutations.ts`, `router/threads.ts`, `set-status` handler, web properties/commands/toolbar/quick-actions status, optimistic handlers | No web generic writes for status/priority/assign; procedures + optimistic live |
| [ ] **LP-003b** | `thread.linkGithubIssue` / `unlinkGithubIssue` | `thread-mutations.ts`, `issues.tsx`, optimistic handlers | `issues.tsx` has zero `thread.update` + `update.insert` for issue link/unlink |
| [ ] **LP-003c** | `thread.linkGithubPullRequest` / `unlinkGithubPullRequest` | `thread-mutations.ts`, `pull-requests.tsx`, optimistic handlers | `pull-requests.tsx` has zero generic thread/update pairs for PR link/unlink |
| [ ] **LP-003d** | `thread.markDuplicate` | `thread-mutations.ts`, `quick-actions.tsx` duplicate accept, `mark-duplicate` handler → shared helper, optimistic | Duplicate accept uses `mutate.thread.markDuplicate` only |
| [ ] **LP-003e** | `thread.archive` / `thread.restore` | `thread-mutations.ts`, `threads/$id/index.tsx` delete, `archive/$id.tsx` restore, optimistic (archive) | Archive/restore use procedures; no generic `thread.update` for `deletedAt` |
| [ ] **LP-003f** | Signal handler convergence (close + mark-duplicate) | `close.ts`, `mark-duplicate.ts` → `runSetThreadStatus` / `runMarkDuplicate` | Handlers call shared helpers, not raw `db.thread.update` + `insertThreadActivity` |
| [ ] **LP-003g** | `thread.setAgentRead` (worker) | `thread-mutations.ts`, `apps/worker/src/lib/agent-read.ts` | Worker uses `thread.setAgentRead`; no generic `thread.update` for `agentRead` |
| [ ] **LP-003h** | Web devtools → `thread.create` / `message.create` | `create-thread-button.tsx`, `duplicate-thread-command.tsx`; remove generic `author.insert` | Devtools use procedures only |
| [ ] **LP-003i** | `thread.create` optimistic (optional) | `live-state.ts` if product `mutate.thread.create` paths need instant UI | Document yes/no in matrix; implement only if fire-and-forget `mutate` callers exist |
| [ ] **LP-003j** | Slack → `thread.create` / `message.create` | `apps/slack/src/index.ts` (`store.mutate` / `fetchClient` thread/message/author inserts) | Ripgrep: no `store.mutate.thread.insert` / `message.insert` in slack |
| [ ] **LP-003k** | Discord → `thread.create` / `message.create` | `apps/discord/src/index.ts` | Same as LP-003j for discord |
| [ ] **LP-003l** | GitHub webhook thread status | `apps/github/src/webhooks/index.ts` → `thread.setStatus` (or internal helper) | Webhook stops `store.mutate.thread.update` + `update.insert` |
| [ ] **LP-003m** | Slack/Discord thread field sync | Remaining `thread.update` in slack/discord (e.g. channel metadata sync) | Map each to a named procedure or document exception |
| [ ] **LP-003n-lockdown** | Deny generic `thread` / `message` / `author` writes | `router/threads.ts`, `router/message.ts`, `router/author.ts` — `insert`/`update` → `false` | All LP-003a–m complete; typecheck + ripgrep clean |

### LP-004 — `update`, `label`, `threadLabel`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-004-labels** | *(already done)* | `label.*` procedures + web optimistic | Label family complete per matrix |
| [ ] **LP-004a** | `update.recordActivity` (internal) | `router/update.ts` new procedure; migrate API-internal `db.insert(schema.update)` not owned by `thread.*` | Internal timeline writes use `recordActivity` or thread procedures |
| [ ] **LP-004b** | Slack `update.update` | `apps/slack/src/index.ts` `fetchClient.mutate.update.update` | Slack has no generic `update.update` |
| [ ] **LP-004c** | Discord `update.update` | `apps/discord/src/index.ts` | Discord has no generic `update.update` |
| [ ] **LP-004d** | `apply-label` handler convergence | `apply-label.ts` → shared label attach helper | Handler reuses `label.attachToThread` logic |
| [ ] **LP-004e-lockdown** | Deny generic `update` writes | `router/update.ts` | Product + integration callers migrated; github webhook timeline covered |

### LP-005 — `organization`, `organizationUser`, `user`, `invite`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [ ] **LP-005a** | `organization.updateSettings` + builder rename | `router/organization.ts` `withProcedures`, `settings/organization/index.tsx`, `support-intelligence.tsx` | No `mutate.organization.update` in web |
| [ ] **LP-005b** | `organizationUser.updateMember` | `router/organization-user.ts`, `team.tsx` role/enabled toggles | No `mutate.organizationUser.update` in web |
| [ ] **LP-005c** | `user.updateProfile` | `router/user.ts` new procedure, `settings/user/index.tsx` | No `mutate.user.update` in web |
| [ ] **LP-005d** | `invite.revoke` | `router/invite.ts`, `team.tsx` invite revoke | No `mutate.invite.update` in web |
| [ ] **LP-005e-lockdown** | Deny generic org-family writes | `organization`, `organizationUser`, `user`, `invite` routes | All LP-005a–d complete |

### LP-006 — `integration`, `externalEntity`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [ ] **LP-006a** | `integration.connectInstallation` / `updateInstallation` (web) | `router/integration.ts` `withProcedures`, slack/discord/github settings, `lib/integrations/activate.ts` | No `mutate.integration.insert` / `.update` in web |
| [ ] **LP-006b** | Slack integration app writes | `apps/slack` `installation-store.ts`, `utils.ts` | Slack app uses integration procedures |
| [ ] **LP-006c** | Discord integration app writes | `apps/discord/lib/utils.ts` | Discord app uses integration procedures |
| [ ] **LP-006d** | GitHub integration app writes | `apps/github/routes/setup.ts` | GitHub app uses integration procedures |
| [ ] **LP-006e-lockdown** | Deny generic integration / externalEntity writes | `router/integration.ts`, `router/external-entity.ts` `withProcedures` rename | Procedures only; externalEntity already procedure-only |

### LP-007 — `onboarding`, `documentationSource`, `agentChat`, `autonomousAction`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [ ] **LP-007a** | Onboarding builder rename + lockdown | `router/onboarding.ts` — procedures already used by web via `fetchClient` / `mutate` | Generic onboarding insert/update denied |
| [ ] **LP-007b** | Documentation source worker + rename | `router/documentation-source.ts` `withProcedures`, `worker/.../crawl-documentation.ts` | Worker uses `documentationSource.*` procedure, not generic `update` |
| [ ] **LP-007c** | Agent chat builder rename | `router/agent-chat.ts` `withProcedures`; verify no generic writes | Builder renamed; writes remain procedure-only |
| [ ] **LP-007d** | `autonomousAction.record` convergence | `autonomous-receipts.ts` → `record` procedure | No direct `db.autonomousAction.insert` bypass |
| [ ] **LP-007e-lockdown** | Deny generic writes on LP-007 routes | onboarding, documentationSource, agentChat, autonomousAction | All LP-007a–d complete |

### LP-008 — Cross-route lockdown audit

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [ ] **LP-008** | Final generic-write audit | Verify every product route denies insert/update; document `pipeline*`, `subscription`, `allowlist`, `migration` exceptions | LP-003n, 004e, 005e, 006e, 007e all done; matrix matches reality |

### LP-009 — End-to-end verification

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [ ] **LP-009a** | Repo-wide static verification | `bun run typecheck`, ripgrep for `mutate.<product>.insert` / `.update` under `apps/` | Zero unintended product generic writes |
| [ ] **LP-009b** | Smoke test matrix | Manual or scripted exercise of inbox, thread properties, labels, settings, integrations | Verification ledger lists paths tested + gaps |

## Checklist

- [x] LP-001: Inventory all API route write capabilities and repository call sites. Completion: ledger contains a route-by-route matrix of generic writes, custom procedures, all call-site usage, web usage, and web optimistic mutation status.
- [x] LP-002: Define the target procedure contract. Completion: documented conventions for naming, input schemas, authorization, return values, optimistic handlers, and whether generic writes stay available for internal-only routes.
- [ ] LP-003: Migrate thread and message writes. Completion: all **LP-003a–n** slices done (including lockdown).
- [ ] LP-004: Migrate label, thread-label, and update writes. Completion: all **LP-004\*** slices done (labels already ✓).
- [ ] LP-005: Migrate organization, organization-user, invite, and user writes. Completion: all **LP-005a–e** slices done.
- [ ] LP-006: Migrate integration and external-entity writes. Completion: all **LP-006a–e** slices done.
- [ ] LP-007: Migrate onboarding, documentation-source, agent-chat, and autonomous-action writes. Completion: all **LP-007a–e** slices done.
- [ ] LP-008: Lock down generic route permissions. Completion: **LP-008** audit slice done.
- [ ] LP-009: Verify the migration end-to-end. Completion: **LP-009a–b** slices done.

## Decisions

- 2026-06-21: Created the project around custom API write procedures, not boot-time data migrations, because the request pairs the work with web optimistic mutations.
- 2026-06-21: Corrected the target API primitive from `.withMutations(...)` to `withProcedures` per user direction.
- 2026-06-21: Expanded migration scope from web call sites to all repository call sites; optimistic mutation work remains web-only.
- 2026-06-21: The migration will be sliced by route family so each step can preserve behavior and verify web usage before generic writes are locked down.
- 2026-06-21 (LP-002): Thread property changes that today pair `thread.update` + `update.insert` become atomic `thread.*` procedures (`setStatus`, `setPriority`, `assignUser`, link/unlink helpers, etc.); product callers must not insert timeline rows via generic `update.insert`.
- 2026-06-21 (LP-002): `author` generic insert is blocked without a dedicated procedure — rows are always created inside `thread.create` / `message.create`.
- 2026-06-21 (LP-002): Optimistic mutations required for high-traffic synced `mutate.thread.*` procedures; settings/onboarding/integration procedures stay fetchClient-only without optimistic handlers unless usage changes.
- 2026-06-21 (LP-003): Thread property helpers (`runSetThreadStatus`, `runSetThreadPriority`, `runAssignThreadUser`) live in `apps/api/src/lib/thread-mutations.ts`; `set-status` signal handler delegates to `runSetThreadStatus`. Procedure input may include optional `userId`/`userName` for optimistic reconciliation; server always uses session actor for authorization and activity `userId`.
- 2026-06-21: Broke LP-003–LP-009 into **PR slices** (one PR per slice id). Lockdown slices ship after caller migration. Parent checklist items complete when all child slices are done.

## PR Feedback

- Status: none.

## Verification Ledger

- 2026-06-21: Not run. Reason: created the planning ledger only; no production code changed.
- 2026-06-21: LP-001 inventory verified by ripgrep across `apps/{api,web,worker,slack,discord,github,cli}` for `mutate.*`, `fetchClient.mutate.*`, `store.mutate.*`, and API `db.*` write paths in router + signal handlers. No typecheck or runtime exercise — documentation-only session.
- 2026-06-21 (LP-002): Contract cross-checked against `agents/saved-prompts/update-routers.md`, `authorize.ts`, `labels.ts`, `threads.ts`, `external-entity.ts`, and `apps/web/src/lib/live-state.ts`. Documentation-only — no typecheck run.
- 2026-06-21 (LP-003 partial): `bun run --filter api typecheck` and `bun run --filter web typecheck` pass. Ripgrep confirms web status/priority/assign paths use `mutate.thread.setStatus|setPriority|assignUser`; remaining generic `thread.update` in `issues.tsx`, `pull-requests.tsx`, `archive/$id.tsx`, `threads/$id/index.tsx`, `quick-actions.tsx` (`markDuplicate`). No runtime UI smoke test.

## Session Log

- 2026-06-21: Created ledger for migrating `apps/api` Live-State writes to explicit custom procedures and coupling web-used procedures with optimistic handlers. Initial repository scan identified the main API route files and existing web mutation call sites.
- 2026-06-21: Updated project terminology and operating instructions to target `withProcedures` instead of `withMutations`.
- 2026-06-21: Updated scope so all repository call sites migrate to procedures, with optimistic mutations only for `apps/web`.
- 2026-06-21 (LP-001): Built full write inventory matrix in this ledger — 16 product routes + 5 internal-only routes + API-internal signal/agent paths. Key findings: `thread.update` + `update.insert` are the densest generic web pattern; slack/discord still generic-insert threads/messages; several families use legacy `withMutations`; `autonomous-receipts.ts` bypasses `autonomousAction.record`; optimistic coverage is strong for `label` and partial for `message`/`thread` signals only.
- 2026-06-21 (LP-002): Added **Target procedure contract** — naming, Zod inputs, `authorize` rules, return values, shared helpers, web optimistic criteria, LP-008 lockdown table, and per-slice planned procedure catalog for LP-003–LP-007.
- 2026-06-21 (LP-003 partial): Implemented `thread.setStatus`, `thread.setPriority`, `thread.assignUser` in `apps/api/src/lib/thread-mutations.ts` + `router/threads.ts`; refactored `set-status` signal handler; migrated web call sites (`actions/threads.ts`, `properties.tsx`, command palette, toolbar, quick-actions status accept); added optimistic handlers in `live-state.ts`.
- 2026-06-21: Added **PR slices** section — LP-003 split into 14 slices (003a–n), LP-004–007 into 4–6 slices each, LP-008–009 into audit/verification slices. Updated checklist to reference child slices.

## Handoff

Next action: Ship **LP-003b** — implement `thread.linkGithubIssue` / `unlinkGithubIssue` in `apps/api/src/lib/thread-mutations.ts`, migrate `apps/web/src/components/threads/issues.tsx`, add optimistic handlers. See **PR slices** table for scope and completion criteria.
