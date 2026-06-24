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
- **`withHooks` is deprecated** — do not add new `.withHooks(...)` on routes. Declare hooks with **`defineHooks<typeof schema>({ … })`** in `apps/api/src/live-state/hooks.ts` (or a focused module) and pass the result to **`server({ hooks, … })`** in `apps/api/src/index.ts`. Use `mergeHooks` when combining hook slices.
- **Do not use ad-hoc authorization** in procedure handlers, queries, or lib code. Use **`authorize`** / **`isAuthorized`** from `apps/api/src/lib/authorize.ts`. When a flow does not fit (portal userId match, thread-author bypass, integration-only fields, etc.), **extend `authorize.ts`** — new options, helpers, or context fields — instead of inlining `req.context?.session` / `internalApiKey` checks. Bundle `authorize.ts` changes with the slice that needs them.
- **No generic collection mutations anywhere** — every route must deny generic `insert`/`update`, including internal-key-only tables. Worker/integration callers use named procedures; API-process side effects use `db.*` / `storage.*` directly. Never leave `insert: ({ ctx }) => !!ctx?.internalApiKey` (or equivalent) on a collection route.

## Current State

- Status: in-progress
- Active checkpoint: **LP-010b** (`onboarding.ts` + `documentation-sources.ts` next)
- Branch or PR: https://github.com/FrontDeskHQ/front-desk/pull/308 (stacked on #307 / `feat/lp-008-pipeline-lockdown`)
- Last updated: 2026-06-24

LP-001 inventory is complete below. API routes live in `apps/api/src/live-state/router.ts` and `apps/api/src/live-state/router/*.ts`. Route families now use `withProcedures` for custom operations. Web writes use both `mutate.*` (synced client) and `fetchClient.mutate.*` (HTTP); optimistic handlers are centralized in `apps/web/src/lib/live-state.ts`.

**LP-003 complete** (including **LP-003o** hooks migration). Generic `thread` / `message` / `author` `insert`/`update` denied. Lifecycle hooks live in `live-state/hooks.ts` via `defineHooks` + `server({ hooks })`. **LP-004 complete** — `update.recordActivity` + `runRecordActivity` helper; slack/discord on `update.markReplicated`; generic `update` `insert`/`update` denied. **LP-005 complete** — org-family procedures (`updateSettings`, `updateMember`, `updateProfile`, `revoke`); builders renamed to `withProcedures` where touched; generic `organization` / `organizationUser` / `user` / `invite` `insert`/`update` denied. **LP-006 complete** — `integration.connectInstallation` / `updateInstallation`; builders renamed to `withProcedures` on `integration` and `externalEntity`; generic `integration` `insert`/`update` denied; all web + slack/discord/github callers migrated. **LP-007 complete** — onboarding / documentationSource / agentChat builders renamed to `withProcedures`; `documentationSource.syncCrawlProgress` for worker crawl status; `runRecordAutonomousAction` helper converges `autonomous-receipts.ts` with `autonomousAction.record`; generic writes denied on all four routes. **LP-008 complete** — all routes deny generic `insert`/`update` (zero `insert: ({ ctx })` in router). Worker pipeline writes use `pipelineIdempotencyKey.{upsert,invalidate,batchUpsert}` and `pipelineJob.{create,patch}`; `allowlist` / `subscription` writes are API-internal `db.*` / `storage.*` only.

## Write inventory matrix

Legend:

- **Generic insert/update**: collection-route default mutators.
- **Procedure API**: custom named writes (`withProcedures` or legacy `withMutations`).
- **Web**: `apps/web` call sites only.
- **Optimistic**: handler in `apps/web/src/lib/live-state.ts` (`yes` / `no` / `n/a`).

### Product routes (migrate generic writes off the primary API)

| Route | Generic insert | Generic update | Procedure API (current) | Non-web call sites | Web call sites | Web optimistic |
| --- | --- | --- | --- | --- | --- | --- |
| `thread` | **disabled** | **disabled** | `withProcedures`: `create`, `setStatus`✓, `setPriority`✓, `assignUser`✓, `linkIssue`✓, `unlinkIssue`✓, `linkPullRequest`✓, `unlinkPullRequest`✓, `markDuplicate`✓, `archive`✓, `restore`✓, `setAgentRead`✓, `list`†, … | none (slack/discord/github/worker migrated) | Devtools + web procedures only | **Partial** — optimistic for … `markDuplicate`, `archive`. **Intentional gap:** `create` (all callers use awaited `fetchClient`); `restore` (navigates away immediately). **Missing** for `createGithubIssue`. |
| `message` | **disabled** | **disabled** | `withProcedures`: `create`, `markAsAnswer`, `setExternalMessageId`✓, `search`† | slack/discord outbound sync via `message.setExternalMessageId`. **API-internal** `db.message.insert`: signal handler `reply.ts`, `agent-chat` `acceptDraft`. | `reply-editor.tsx` (`create`), portal `support/$slug/threads/$id.tsx` (`create`, `markAsAnswer`), `search/index.tsx` (`search`), `thread-reply.tsx` (`markAsAnswer`). Devtools duplicate uses `thread.create` (includes first message). | **Partial** — `create`, `markAsAnswer` yes. |
| `author` | **disabled** | **disabled** | none | Created inside `thread.create`, `message.create`, `agent-chat` `acceptDraft`, signal `reply.ts`. | none direct (devtools author rows created inside `thread.create`). | **No** (author rows optimistically created only as side effect of `message.create`). |
| `update` | **disabled** | **disabled** | `withProcedures`: `recordActivity`✓, `markReplicated`✓ | **API-internal** timeline writes use `runRecordActivity` in `update-mutations.ts` (thread procedures, signal handlers, `createGithubIssue`, `autonomousAction.undo`). Slack/Discord replication via `update.markReplicated`. | No direct web callers — timeline rows created inside thread procedures' optimistic handlers. | **No** (except side effects inside `autonomousAction.undo` optimistic). |
| `label` | disabled | disabled | `withProcedures`: `create`, `update`, `createAndAttachToThread`, `attachToThread`, `detachFromThread` | **API-internal** `db.label` / `db.threadLabel`: signal handler `apply-label.ts`, `autonomous-action` `undo`. | `labels.tsx` (thread UI), `labels.tsx` (settings), `quick-actions.tsx` (`attachToThread`). | **Yes** — all five procedures. |
| `threadLabel` | disabled | disabled | none (writes only via `label.*` procedures) | **API-internal**: `apply-label.ts`, `autonomous-action` `undo`. | none direct | n/a |
| `organization` | disabled | **disabled** | `withProcedures`: `create`, `updateSettings`✓, `setActionAutonomy`, `createPublicApiKey`, `revokePublicApiKey`, `listApiKeys`† | Boot migration `002_seed_autonomy_settings.ts` (`db.organization.update`). `organization.create` also inserts `subscription` + `organizationUser` server-side. | `onboarding/connect.tsx` (`create`), settings `index.tsx` + `support-intelligence.tsx` (`updateSettings`, `setActionAutonomy`), `api-keys.tsx` (key procedures). | **No** |
| `organizationUser` | disabled | **disabled** | `withProcedures`: `inviteUser`, `updateMember`✓ | Created by `invite.accept`, `organization.create`. | `team.tsx` (`updateMember`, `inviteUser`). | **No** |
| `user` | disabled | **disabled** | `withProcedures`: `updateProfile`✓ | none | `settings/user/index.tsx` (`updateProfile`). | **No** |
| `invite` | disabled | **disabled** | `withProcedures`: `accept`, `decline`, `revoke`✓ | `inviteUser` creates rows; `accept` also inserts `organizationUser` + `allowlist`. | `invitation.$id.tsx` (`accept`, `decline`), `onboarding/index.tsx` (`accept`), `team.tsx` (`revoke`). | **No** |
| `integration` | disabled | disabled | `withProcedures`: `connectInstallation`✓, `updateInstallation`✓, `fetchSlackChannels`† | `apps/slack` (`installation-store`, `utils`), `apps/discord` (`utils`), `apps/github` (`setup.ts`), settings flows via web. | Settings + redirect routes for slack/discord/github, `lib/integrations/activate.ts`, `organization/index.tsx` (`fetchSlackChannels`). | **No** |
| `onboarding` | disabled | disabled | `withProcedures`: `initialize`, `completeStep`, `skip`, `complete` | none | `use-onboarding.ts` (all four procedures; `initialize` via `fetchClient`). | **No** |
| `documentationSource` | disabled | disabled | `withProcedures`: `validateDocumentationSource`†, `addDocumentationSource`, `recrawlDocumentationSource`, `deleteDocumentationSource`, `syncCrawlProgress`✓ | `apps/worker` `crawl-documentation.ts` (`documentationSource.syncCrawlProgress` via internal key). | `settings/organization/documentation.tsx` (all custom procedures). | **No** |
| `externalEntity` | disabled | disabled | `withProcedures`: `upsert`, `softDelete`, `syncFromGithub`† | `apps/github` `external-entity.ts` (`upsert`), `jobs/reconcile.ts` + webhooks (`softDelete`). | devtools `github-submenu.tsx` (`syncFromGithub`, dev-only). | **No** |
| `agentChat` | disabled | disabled | `withProcedures`: `create`, `sendMessage`, `acceptDraft`, `dismissDraft`, `updateDraft` | `agentChatMessage` rows written inside `sendMessage` / streaming handlers. | `support-intelligence-chat.tsx`, playground `index.tsx`. | **No** |
| `agentChatMessage` | disabled | disabled | none (written by `agentChat.sendMessage` / server stream) | same as above | none direct | n/a |
| `autonomousAction` | disabled | disabled | `withProcedures`: `record`, `undo`, `seedFake`†, `clearFake`† | **API-internal** `runRecordAutonomousAction`: `signals/autonomous-receipts.ts` (via shared helper). `apps/worker` uses `thread.executeAutonomousBundle` instead of `record` directly. | devtools `signals-submenu.tsx` (`seedFake`, `clearFake`). **No web caller for `undo` yet** despite optimistic handler. | **Partial** — `undo` handler exists, no UI caller. |

† = read/query or dev-only; not a product write path but listed for completeness.

### Internal-only routes (procedures or direct DB — no generic mutations)

| Route | Generic insert | Generic update | Write path | Notes |
| --- | --- | --- | --- | --- |
| `pipelineIdempotencyKey` | disabled | disabled | `upsert`, `invalidate`, `batchUpsert` (internal key) | `apps/worker` `pipeline/core/idempotency.ts` |
| `pipelineJob` | disabled | disabled | `create`, `patch` (internal key) | `apps/worker` `pipeline/core/persistence.ts` |
| `allowlist` | disabled | disabled | `db.insert` inside `invite.accept` only | No Live-State client callers |
| `subscription` | disabled | disabled | `db.insert` in `organization.create`; `storage.update` in Dodo webhook | Billing webhook bypasses Live-State client |
| `migration` | disabled | disabled | `trx.migration.insert` in boot runner | `apps/api/src/live-state/migrations/index.ts` |

### API-internal writes (not Live-State client mutations)

These run inside the API process via `db.*` and must be accounted for when locking generic writes or adding procedures:

| Area | Tables touched | Entry points |
| --- | --- | --- |
| Signal action handlers | `thread`, `message`, `author`, `threadLabel`, `update` | `apps/api/src/lib/signals/handlers/*.ts`, `activity.ts` |
| Signal thread procedures | `thread` | `apps/api/src/lib/signals/thread-procedures.ts` (used by `thread.*` procedures) |
| Autonomous receipts | `autonomousAction` | `apps/api/src/lib/signals/autonomous-receipts.ts` — uses `runRecordAutonomousAction` shared helper |
| Agent chat streaming | `agentChat`, `agentChatMessage`, `message`, `author` | `apps/api/src/live-state/router/agent-chat.ts` handlers |
| Boot migrations | `thread`, `organization`, … | `apps/api/src/live-state/migrations/files/*.ts` |

### Cross-cutting web patterns (generic writes to replace)

1. **`thread.update` + `update.insert` pairs** — status, priority, assignment, PR link/unlink, duplicate mark, archive restore. Central helpers in `apps/web/src/actions/threads.ts`; also inline in `properties.tsx`, `quick-actions.tsx`, `issues.tsx`, `pull-requests.tsx`.
2. **`integration.insert` / `integration.update`** — OAuth connect flows across slack, discord, github settings and `lib/integrations/activate.ts`.
3. **Devtools** — `create-thread-dialog.tsx` and `duplicate-thread-command.tsx` use `thread.create` ✓.
4. **Integration bots** — slack/discord use `thread.create` / `message.create` / `message.setExternalMessageId` only (generic writes locked down in LP-003n).

### Optimistic mutation coverage summary (`apps/web/src/lib/live-state.ts`)

| Resource | Procedures with optimistic handler | Intentional gap / notes |
| --- | --- | --- |
| `message` | `create`, `markAsAnswer` | Generic `insert` used only in devtools |
| `label` | all five write procedures | Complete |
| `thread` | `acceptRead`, `dismissRead`, `acceptInlineSuggestion`, `dismissInlineSuggestion`, `setStatus`, `setPriority`, `assignUser`, `linkIssue`, `unlinkIssue`, `linkPullRequest`, `unlinkPullRequest`, `markDuplicate`, `archive` | `create` omitted (all callers use awaited `fetchClient`); `restore` omitted (immediate navigation) |
| `autonomousAction` | `undo` | Handler ready; no web caller wired yet |
| All other routes | none | Settings/onboarding/integration writes are mostly `fetchClient` or infrequent — assess per procedure in LP-002 |

## Target procedure contract (LP-002)

Authoritative implementation habits also live in `agents/saved-prompts/update-routers.md`. This section is the migration contract for this project.

### API primitive

- Declare custom writes and reads with **`withProcedures`** (`mutation` / `query`). Do not add new `withMutations` routes.
- When touching a legacy `withMutations` route during LP-003–LP-007, rename the builder to `withProcedures` in the same PR (procedure names stay stable).
- **Lifecycle hooks** use **`defineHooks`** registered on **`server({ hooks })`**, not `.withHooks(...)` on routes (`withHooks` is deprecated in `@live-state/sync`).
- **Queries** (`list`, `search`, `fetchRelatedThreads`, …) are out of migration scope unless a generic write is being replaced; they may remain as-is.

### Naming

| Rule | Example |
| --- | --- |
| Use a **verb** that names the product operation, not the SQL shape | `create`, `setStatus`, `attachToThread`, `upsert`, `record` |
| Prefer **one procedure per real operation** — no UI-side branching that the server already owns | `attachToThread` resolves natural keys; clients do not `insert` + `update` pairs |
| Put the procedure on the collection that owns the **product concept**, even when other tables are touched | label attach/detach live on `label.*`; timeline rows are a side effect of `thread.*` |
| Use **paired, consistent names** for inverse operations | `attachToThread` / `detachFromThread`; `linkIssue` / `unlinkIssue` |
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

- **Single entry point:** `apps/api/src/lib/authorize.ts` — **`authorize(req, opts)`** throws `UNAUTHORIZED`; **`isAuthorized(ctx, opts)`** returns boolean. Do not duplicate membership / key / role logic inline.
- **`AuthorizeOptions`:** `organizationId` (required), optional `role`, `allowPublicApiKey`, `allowInternalApiKey` (default `true` for internal key bypass). Extend this module when a new pattern appears (e.g. portal session, thread-author read, owner-only) rather than scattering checks.
- Resolve `organizationId` from the target row when it is not in input (load entity → `authorize` → mutate).
- **Portal**, **public API key**, and **integration-only input** may still need **small, documented guards** beside `authorize` (e.g. portal `userId` must match input). Prefer folding repeated guards into `authorize.ts` during **LP-010**.
- Collection-route **`insert` / `update` (pre/post)** become **deny-by-default** once callers are migrated.
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
| **All routes — disabled** | Every collection in `schema` | `false` / deny on every route; no internal-key generic mutators |
| **Product writes** | `thread`, `message`, … (17 product routes) | Named procedures only |
| **Worker pipeline** | `pipelineIdempotencyKey`, `pipelineJob` | `upsert` / `invalidate` / `batchUpsert`; `create` / `patch` (internal key) |
| **API-internal DB** | `allowlist`, `subscription` | `db.*` / `storage.*` inside API process only |
| **Boot-only** | `migration` | `trx.migration.insert` in migrations runner only |

### LP-008 audit results (2026-06-24)

Route-by-route generic mutator permissions in `apps/api/src/live-state/router*.ts` (verified by ripgrep + file read):

| Route | `insert` | `update` | Route file |
| --- | --- | --- | --- |
| `thread` | `false` | denied | `router/threads.ts` |
| `message` | `false` | denied | `router/message.ts` |
| `author` | `false` | denied | `router.ts` |
| `update` | `false` | denied | `router/update.ts` |
| `label` | `false` | denied | `router/labels.ts` |
| `threadLabel` | `false` | denied | `router/labels.ts` |
| `organization` | `false` | denied | `router.ts` |
| `organizationUser` | `false` | denied | `router.ts` |
| `user` | `false` | denied | `router.ts` |
| `invite` | `false` | denied | `router.ts` |
| `integration` | `false` | denied | `router/integration.ts` |
| `externalEntity` | `false` | denied | `router/external-entity.ts` |
| `onboarding` | `false` | denied | `router/onboarding.ts` |
| `documentationSource` | `false` | denied | `router/documentation-sources.ts` |
| `agentChat` | `false` | denied | `router/agent-chat.ts` |
| `agentChatMessage` | `false` | denied | `router/agent-chat.ts` |
| `autonomousAction` | `false` | denied | `router/autonomous-action.ts` |
| `allowlist` | `false` | denied | `router.ts` |
| `subscription` | `false` | denied | `router.ts` |
| `pipelineIdempotencyKey` | `false` | denied | `router/pipeline.ts` |
| `pipelineJob` | `false` | denied | `router/pipeline.ts` |
| `migration` | `false` | denied | `router.ts` |

**Direct DB exceptions (not Live-State generic mutations):**

| Route | Mechanism | Call sites |
| --- | --- | --- |
| `allowlist` | `db.insert` inside `invite.accept` | `router.ts` |
| `subscription` | `db.insert` in `organization.create`; `storage.update` in Dodo webhook | `router.ts`, `apps/api/src/index.ts` (4 webhook sites) |
| `migration` | `trx.migration.insert` in boot runner | `migrations/index.ts` |

**Repo-wide client scan (`apps/`):** zero `mutate.<resource>.(insert|update)(` call sites (ripgrep). All writes are named procedures or API-internal `db.*`. Zero `withMutations` under `apps/api`. Zero `insert: ({ ctx })` in `apps/api/src/live-state`.

### Planned procedure catalog (by migration slice)

Procedures **already implemented** are marked ✓. Others are the LP-003–LP-007 target names — adjust only with a `Decisions` entry.

#### LP-003: `thread`, `message`, `author`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| `create` ✓ | `thread` | generic `thread.insert` (web devtools, slack, discord) | **no** — all web callers use awaited `fetchClient`; devtools + portal |
| `setStatus` ✓ | `thread` | generic `thread.update` status + `update.insert` status_changed | **yes** ✓ |
| `setPriority` ✓ | `thread` | generic `thread.update` priority + `update.insert` priority_changed | **yes** ✓ |
| `assignUser` ✓ | `thread` | generic `thread.update` assignedUserId + `update.insert` assigned_changed | **yes** ✓ |
| `linkIssue` / `unlinkIssue` ✓ | `thread` | generic `thread.update` externalIssueId + paired `update.insert` | **yes** ✓ |
| `linkPullRequest` / `unlinkPullRequest` ✓ | `thread` | generic `thread.update` externalPrId + paired `update.insert` | **yes** ✓ |
| `markDuplicate` ✓ | `thread` | generic `thread.update` status duplicate + activity | **yes** ✓ |
| `archive` / `restore` ✓ | `thread` | generic `thread.update` deletedAt / status | **yes** for archive only ✓ |
| `setAgentRead` ✓ | `thread` | generic `thread.update` agentRead (worker `agent-read.ts`) | **no** — worker-only |
| `create` ✓ | `message` | generic `message.insert` (slack, discord, devtools) | ✓ already |
| `markAsAnswer` ✓ | `message` | — | ✓ already |
| `setExternalMessageId` ✓ | `message` | generic `message.update` external id (slack, discord outbound) | **no** — integration fire-and-forget |
| — | `author` | generic `author.insert` | **no** — always created inside `thread.create` / `message.create`; generic insert blocked |

#### LP-004: `update`, `label`, `threadLabel`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| (thread procedures above own timeline inserts) | `update` | generic `update.insert` from web + github webhook | **n/a** — product callers stop inserting directly |
| `recordActivity` ✓ | `update` | any remaining **internal** timeline writes that are not part of a thread procedure | **no** |
| `markReplicated` ✓ | `update` | generic `update.update` `replicatedStr` patch (slack/discord outbound sync) | **no** |
| `create` / `update` / `attachToThread` / … ✓ | `label` | — | ✓ already |
| — | `threadLabel` | direct writes | remain blocked; only via `label.*` |

#### LP-005: `organization`, `organizationUser`, `user`, `invite`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| `create` ✓ | `organization` | — | **no** — onboarding uses `fetchClient`, awaited |
| `updateSettings` ✓ | `organization` | generic `organization.update` (support URL, name, …) | **no** |
| `setActionAutonomy` ✓ | `organization` | — | **no** |
| `createPublicApiKey` / `revokePublicApiKey` ✓ | `organization` | — | **no** |
| `inviteUser` ✓ | `organizationUser` | — | **no** |
| `updateMember` ✓ | `organizationUser` | generic `organizationUser.update` (role, enabled) | **no** |
| `updateProfile` ✓ | `user` | generic `user.update` | **no** |
| `accept` / `decline` ✓ | `invite` | — | **no** |
| `revoke` ✓ | `invite` | generic `invite.update` revoke | **no** |

#### LP-006: `integration`, `externalEntity`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| `connectInstallation` ✓ | `integration` | generic `integration.insert` (slack/discord/github) | **no** — OAuth / `fetchClient` |
| `updateInstallation` ✓ | `integration` | generic `integration.update` | **no** |
| `fetchSlackChannels` ✓ (query) | `integration` | — | — |
| `upsert` / `softDelete` ✓ | `externalEntity` | — | **no** |
| `syncFromGithub` ✓ (query) | `externalEntity` | — | — |

#### LP-007: `onboarding`, `documentationSource`, `agentChat`, `autonomousAction`

| Procedure | Route | Replaces | Web optimistic |
| --- | --- | --- | --- |
| `initialize` / `completeStep` / `skip` / `complete` ✓ | `onboarding` | generic `onboarding.insert` / `update` | **no** — `fetchClient` |
| `addDocumentationSource` / … ✓ | `documentationSource` | generic `update` in worker crawl | **no** |
| `syncCrawlProgress` ✓ | `documentationSource` | worker crawl status/progress updates | **no** |
| `create` / `sendMessage` / draft procedures ✓ | `agentChat` | — | **no** — streamed server state |
| `record` ✓ | `autonomousAction` | `db.autonomousAction.insert` in `autonomous-receipts.ts` | **no** |
| `undo` ✓ | `autonomousAction` | — | ✓ handler exists; wire UI or drop handler in LP-009 if still unused |

### Verification expectations (per migration PR)

1. `bun run typecheck` (root or affected apps).
2. Ripgrep: no remaining `mutate.<resource>.insert` / `.update` for the migrated resource under `apps/`.
3. Generic mutator disabled on that route when the checklist item says so.
4. Web: exercise or manually smoke the touched UI paths; note gaps in `Verification Ledger`.

## PR slices (one PR per row)

Parent checklist items (`LP-003`–`LP-010`) complete when all child slices under them are checked. Slices are ordered by dependency where it matters; otherwise they can ship in parallel.

### LP-003 — `thread`, `message`, `author`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-003a** | `thread.setStatus` / `setPriority` / `assignUser` | `thread-mutations.ts`, `router/threads.ts`, `set-status` handler, web properties/commands/toolbar/quick-actions status, optimistic handlers | No web generic writes for status/priority/assign; procedures + optimistic live |
| [x] **LP-003b** | `thread.linkIssue` / `unlinkIssue` | `thread-mutations.ts`, `issues.tsx`, optimistic handlers | `issues.tsx` has zero `thread.update` + `update.insert` for issue link/unlink |
| [x] **LP-003c** | `thread.linkPullRequest` / `unlinkPullRequest` | `thread-mutations.ts`, `pull-requests.tsx`, optimistic handlers | `pull-requests.tsx` has zero generic thread/update pairs for PR link/unlink |
| [x] **LP-003d** | `thread.markDuplicate` | `thread-mutations.ts`, `quick-actions.tsx` duplicate accept, `mark-duplicate` handler → shared helper, optimistic | Duplicate accept uses `mutate.thread.markDuplicate` only |
| [x] **LP-003e** | `thread.archive` / `thread.restore` | `thread-mutations.ts`, `threads/$id/index.tsx` delete, `archive/$id.tsx` restore, optimistic (archive) | Archive/restore use procedures; no generic `thread.update` for `deletedAt` |
| [x] **LP-003f** | Signal handler convergence (close) | `close.ts` → `runSetThreadStatus` | Handler calls shared helper, not raw `db.thread.update` + `insertThreadActivity` |
| [x] **LP-003g** | `thread.setAgentRead` (worker) | `thread-mutations.ts`, `apps/worker/src/lib/agent-read.ts` | Worker uses `thread.setAgentRead`; no generic `thread.update` for `agentRead` |
| [x] **LP-003h** | Web devtools → `thread.create` / `message.create` | `create-thread-dialog.tsx` (already migrated), `duplicate-thread-command.tsx`; removed dead `create-thread-button.tsx` | Devtools use procedures only |
| [x] **LP-003i** | `thread.create` optimistic (optional) | Documented intentional omission — no fire-and-forget `mutate.thread.create` callers | Matrix updated; no handler added |
| [x] **LP-003j** | Slack → `thread.create` / `message.create` | `apps/slack/src/index.ts` (`store.mutate` / `fetchClient` thread/message/author inserts) | Ripgrep: no `store.mutate.thread.insert` / `message.insert` in slack |
| [x] **LP-003k** | Discord → `thread.create` / `message.create` | `apps/discord/src/index.ts` | Same as LP-003j for discord |
| [x] **LP-003l** | GitHub webhook thread status | `apps/github/src/webhooks/index.ts` → `thread.setStatus` (or internal helper) | Webhook stops `store.mutate.thread.update` + `update.insert` |
| [x] **LP-003m** | Slack/Discord thread field sync | Remaining `thread.update` in slack/discord (e.g. channel metadata sync) | Map each to a named procedure or document exception |
| [x] **LP-003n-lockdown** | Deny generic `thread` / `message` / `author` writes | `router/threads.ts`, `router/message.ts`, `router.ts` author — `insert`/`update` → `false`; `message.setExternalMessageId` for slack/discord outbound | All LP-003a–m complete; typecheck + ripgrep clean |
| [x] **LP-003o** | Migrate `withHooks` → `defineHooks` | `live-state/hooks.ts`, `index.ts`; remove `.withHooks` from `router/threads.ts`, `router/message.ts` | Zero `.withHooks` under `apps/api`; `message.afterInsert` enqueue on `server({ hooks })` |

### LP-004 — `update`, `label`, `threadLabel`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-004-labels** | *(already done)* | `label.*` procedures + web optimistic | Label family complete per matrix |
| [x] **LP-004a** | `update.recordActivity` (internal) | `router/update.ts` new procedure; migrate API-internal `db.insert(schema.update)` not owned by `thread.*` | Internal timeline writes use `recordActivity` or thread procedures |
| [x] **LP-004b** | Slack `update.update` | `apps/slack/src/index.ts` `fetchClient.mutate.update.update` → `update.markReplicated` | Slack has no generic `update.update` |
| [x] **LP-004c** | Discord `update.update` | `apps/discord/src/index.ts` | Discord has no generic `update.update` |
| [x] **LP-004d** | `apply-label` handler convergence | `apply-label.ts` → shared label attach helper | Handler reuses `label.attachToThread` logic |
| [x] **LP-004e-lockdown** | Deny generic `update` writes | `router/update.ts` | Product + integration callers migrated; github webhook timeline covered |

### LP-005 — `organization`, `organizationUser`, `user`, `invite`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-005a** | `organization.updateSettings` + builder rename | `router.ts` organization `withProcedures`, `settings/organization/index.tsx`, `support-intelligence.tsx` | No `mutate.organization.update` in web |
| [x] **LP-005b** | `organizationUser.updateMember` | `router.ts` organizationUser `withProcedures`, `team.tsx` role/enabled toggles | No `mutate.organizationUser.update` in web |
| [x] **LP-005c** | `user.updateProfile` | `router.ts` user `withProcedures`, `settings/user/index.tsx` | No `mutate.user.update` in web |
| [x] **LP-005d** | `invite.revoke` | `router.ts` invite `withProcedures`, `team.tsx` invite revoke | No `mutate.invite.update` in web |
| [x] **LP-005e-lockdown** | Deny generic org-family writes | `organization`, `organizationUser`, `user`, `invite` routes | All LP-005a–d complete |

### LP-006 — `integration`, `externalEntity`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-006a** | `integration.connectInstallation` / `updateInstallation` (web) | `router/integration.ts` `withProcedures`, slack/discord/github settings, `lib/integrations/activate.ts` | No `mutate.integration.insert` / `.update` in web |
| [x] **LP-006b** | Slack integration app writes | `apps/slack` `installation-store.ts`, `utils.ts` | Slack app uses integration procedures |
| [x] **LP-006c** | Discord integration app writes | `apps/discord/lib/utils.ts` | Discord app uses integration procedures |
| [x] **LP-006d** | GitHub integration app writes | `apps/github/routes/setup.ts` | GitHub app uses integration procedures |
| [x] **LP-006e-lockdown** | Deny generic integration / externalEntity writes | `router/integration.ts`, `router/external-entity.ts` `withProcedures` rename | Procedures only; externalEntity already procedure-only |

### LP-007 — `onboarding`, `documentationSource`, `agentChat`, `autonomousAction`

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-007a** | Onboarding builder rename + lockdown | `router/onboarding.ts` — procedures already used by web via `fetchClient` / `mutate` | Generic onboarding insert/update denied |
| [x] **LP-007b** | Documentation source worker + rename | `router/documentation-source.ts` `withProcedures`, `worker/.../crawl-documentation.ts` | Worker uses `documentationSource.syncCrawlProgress`, not generic `update` |
| [x] **LP-007c** | Agent chat builder rename | `router/agent-chat.ts` `withProcedures`; verify no generic writes | Builder renamed; writes remain procedure-only |
| [x] **LP-007d** | `autonomousAction.record` convergence | `autonomous-receipts.ts` → `runRecordAutonomousAction` helper | No direct `db.autonomousAction.insert` bypass outside helper + dev `seedFake` |
| [x] **LP-007e-lockdown** | Deny generic writes on LP-007 routes | onboarding, documentationSource, agentChat, autonomousAction | All LP-007a–d complete |

### LP-008 — Cross-route lockdown audit

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-008** | Final generic-write audit | Verify every product route denies insert/update; document `pipeline*`, `subscription`, `allowlist`, `migration` exceptions | LP-003n, 004e, 005e, 006e, 007e all done; matrix matches reality |

### LP-009 — End-to-end verification

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-009a** | Repo-wide static verification | `bun run typecheck`, ripgrep for `mutate.<product>.insert` / `.update` under `apps/` | Zero unintended product generic writes |
| [x] **LP-009b** | Smoke test matrix | Manual or scripted exercise of inbox, thread properties, labels, settings, integrations | Verification ledger lists paths tested + gaps |

### LP-010 — Authorization via `authorize.ts`

Cross-cutting cleanup after procedure migration. Can bundle router-file migrations with LP-004–LP-007 slices when the same file is already in scope; otherwise ship as dedicated PRs.

| Slice | PR title (suggested) | Scope | Completion |
| --- | --- | --- | --- |
| [x] **LP-010a** | Scan ad-hoc authorization | Ripgrep `apps/api/src` for inline `req.context?.session` / `internalApiKey` / `portalSession` checks, manual `orgUsers.find`, and `throw new Error("UNAUTHORIZED")` outside `authorize.ts` | Ledger lists files + patterns; each site tagged migrate / extend-util / intentional-exception |
| [ ] **LP-010b** | Migrate live-state routers | `apps/api/src/live-state/router/**/*.ts` — **`threads.ts` ✓**, **`message.ts` ✓** (2026-06-24); remaining: `onboarding.ts`, `agent-chat.ts`, `documentation-sources.ts`, `external-entity.ts`, `router.ts` org bootstrap | Procedure/query handlers use `authorize` / `isAuthorized`; repeated patterns folded into `authorize.ts` |
| [ ] **LP-010c** | Migrate API lib | `apps/api/src/lib/**` (signal handlers, agent-chat helpers, etc.) | Same criterion as LP-010b for non-router code paths |

## Checklist

- [x] LP-001: Inventory all API route write capabilities and repository call sites. Completion: ledger contains a route-by-route matrix of generic writes, custom procedures, all call-site usage, web usage, and web optimistic mutation status.
- [x] LP-002: Define the target procedure contract. Completion: documented conventions for naming, input schemas, authorization, return values, optimistic handlers, and whether generic writes stay available for internal-only routes.
- [x] LP-003: Migrate thread and message writes. Completion: all **LP-003a–o** slices done (including lockdown and hooks migration).
- [x] LP-004: Migrate label, thread-label, and update writes. Completion: all **LP-004\*** slices done (labels already ✓).
- [x] LP-005: Migrate organization, organization-user, invite, and user writes. Completion: all **LP-005a–e** slices done.
- [x] LP-006: Migrate integration and external-entity writes. Completion: all **LP-006a–e** slices done.
- [x] LP-007: Migrate onboarding, documentation-source, agent-chat, and autonomous-action writes. Completion: all **LP-007a–e** slices done.
- [x] LP-008: Lock down generic route permissions. Completion: **LP-008** audit slice done.
- [x] LP-009: Verify the migration end-to-end. Completion: **LP-009a–b** slices done.
- [ ] LP-010: Consolidate authorization on `authorize.ts`. Completion: **LP-010a–c** slices done — no ad-hoc membership/key/session checks outside `apps/api/src/lib/authorize.ts` except documented exceptions in the ledger.

## Decisions

- 2026-06-21: Created the project around custom API write procedures, not boot-time data migrations, because the request pairs the work with web optimistic mutations.
- 2026-06-21: Corrected the target API primitive from `.withMutations(...)` to `withProcedures` per user direction.
- 2026-06-21: Expanded migration scope from web call sites to all repository call sites; optimistic mutation work remains web-only.
- 2026-06-21: The migration will be sliced by route family so each step can preserve behavior and verify web usage before generic writes are locked down.
- 2026-06-21 (LP-002): Thread property changes that today pair `thread.update` + `update.insert` become atomic `thread.*` procedures (`setStatus`, `setPriority`, `assignUser`, link/unlink helpers, etc.); product callers must not insert timeline rows via generic `update.insert`.
- 2026-06-21 (LP-002): `author` generic insert is blocked without a dedicated procedure — rows are always created inside `thread.create` / `message.create`.
- 2026-06-21 (LP-002): Optimistic mutations required for high-traffic synced `mutate.thread.*` procedures; settings/onboarding/integration procedures stay fetchClient-only without optimistic handlers unless usage changes.
- 2026-06-21 (LP-003): Thread property helpers (`runSetThreadStatus`, `runSetThreadPriority`, `runAssignThreadUser`) live in `apps/api/src/lib/thread-mutations.ts`; `set-status` signal handler delegates to `runSetThreadStatus`. Procedure input may include optional `userId`/`userName` for optimistic reconciliation; server always uses session actor for authorization and activity `userId`.
- 2026-06-21 (LP-003b): Issue link procedures are provider-agnostic (`linkIssue` / `unlinkIssue`); they resolve labels from the `externalEntity` mirror (`type: "issue"`) by `externalKey`, not GitHub-specific APIs. `createGithubIssue` success still calls `linkIssue` separately (create procedure does not auto-link).
- 2026-06-21 (LP-003c): PR link procedures mirror issue link (`linkPullRequest` / `unlinkPullRequest`); labels resolve from `externalEntity` mirror (`type: "pull_request"`). Activity type is `pr_changed` with `oldPrId`/`newPrId`/`oldPrLabel`/`newPrLabel` metadata.
- 2026-06-21 (LP-003d): `runMarkDuplicate` sets status to `STATUS_DUPLICATED` (4) and inserts `marked_duplicate` activity; `mark-duplicate` signal handler delegates to shared helper (compensate snapshot logic retained in handler). Web duplicate accept passes optional `duplicateOfThreadName` for optimistic metadata when target thread is already loaded.
- 2026-06-21 (LP-003e): `runArchiveThread` / `runRestoreThread` own `deletedAt` semantics server-side (`THREAD_DELETION_GRACE_DAYS = 30`); no timeline activity rows (matches prior generic-update behavior). Optimistic handler for `archive` only; `restore` intentionally omitted (user navigates away immediately).
- 2026-06-22 (LP-003f): `close` signal handler delegates to `runSetThreadStatus` with `source: "agent_read"`; added compensate snapshot logic (close is reversible per `isReversible`). Activity insertion now flows through shared helper when `actorUserId` is set.
- 2026-06-22 (LP-003g): `runSetAgentRead` + `thread.setAgentRead` procedure (internal API key only); worker `persistAgentRead` migrated; no web optimistic handler (worker-only).
- 2026-06-22 (LP-003h): Devtools `duplicate-thread-command.tsx` migrated to `thread.create`; dead `create-thread-button.tsx` removed (`create-thread-dialog.tsx` already used procedures). Zero generic `thread`/`message`/`author` inserts in `apps/web`.
- 2026-06-22 (LP-003i): No `thread.create` optimistic handler — all web callers (`create-thread-dialog`, portal `create-thread-dialog`, devtools duplicate) use awaited `fetchClient.mutate.thread.create`; documented intentional omission in matrix.
- 2026-06-22 (LP-003j/k): Extended `thread.create` and `message.create` with optional integration fields (`id`, `createdAt`, `externalId`/`externalOrigin`/`externalMetadataStr`, `discordChannelId`, `status`, `firstMessage`, `author` metaId on `message.create`, `origin`/`isBackfill`/`externalMessageId`). Added `serializeMessageContent` helper. Slack/Discord backfill and realtime ingest use procedures; author rows created inside procedures (no `author.insert`). `message.update` for outbound external id sync remains generic until lockdown.
- 2026-06-22 (LP-003l): Extended `thread.setStatus` for internal API key — optional `recordActivity`, `activityMetadata`, `replicatedStr` on input; GitHub `resolveLinkedThreads` calls `store.mutate.thread.setStatus` with `source: "github"` and `replicatedStr: { github: true }`.
- 2026-06-22 (LP-003m): Discord `backfillMessages` archived/active sync uses `thread.setStatus` (no activity row). Slack had zero `thread.update` call sites — no code change; `update.update` replication marking deferred to LP-004b.
- 2026-06-23 (LP-003n): Denied generic `insert`/`update` on `thread`, `message`, and `author` collection routes. Added `message.setExternalMessageId` (internal API key) for Slack/Discord outbound external id sync; migrated `apps/slack` and `apps/discord` off `message.update`. Author route lockdown lives in `router.ts` (no separate `router/author.ts`).
- 2026-06-23: **`withHooks` → `defineHooks`** — Live-State deprecates route-level `.withHooks`; hooks move to `defineHooks<typeof schema>(…)` in `live-state/hooks.ts` and `server({ hooks })` in `index.ts`. Shipped as **LP-003o**.
- 2026-06-23 (LP-003o): Removed `thread.afterInsert` shortId hook (dead after LP-003n — `thread.create` assigns `shortId` atomically and generic `thread.insert` is denied). Kept `message.afterInsert` thread-read enqueue in `defineHooks`.
- 2026-06-23: **Authorization** — procedures and lib code must use `authorize` / `isAuthorized` from `apps/api/src/lib/authorize.ts`; extend that module for new patterns instead of ad-hoc `req.context` checks. Tracked as **LP-010** (scan + migrate).
- 2026-06-23 (LP-004a): Added `runRecordActivity` in `apps/api/src/lib/update-mutations.ts` and `update.recordActivity` procedure (`withProcedures`). Migrated `insertThreadActivity`, `thread-mutations` activity rows, `createGithubIssue`, and `autonomousAction.undo` to the shared helper. Single `db.insert(schema.update)` site remains in `update-mutations.ts`.
- 2026-06-23 (LP-004b): Added `update.markReplicated` procedure + `runMarkReplicated` helper (internal API key only). Migrated Slack `handleUpdates` replication marking off generic `update.update`. Discord migrated in **LP-004c**.
- 2026-06-24 (LP-005a): Added `organization.updateSettings` — owner-only procedure accepting optional `name`, `slug`, `logoUrl`, `socials`, `customInstructions`, `settings`; validates slug + settings via shared schemas. Renamed organization route builder to `withProcedures`. Web settings forms use `mutate.organization.updateSettings({ organizationId, … })`. Intentional: no optimistic handler (settings use fire-and-forget `mutate` but infrequent; same as prior generic update behavior).
- 2026-06-24 (LP-005b): `organizationUser.updateMember` — owner auth via `authorize`; optional `role` / `enabled`; blocks self role change or removal. Renamed builder to `withProcedures`.
- 2026-06-24 (LP-005c): `user.updateProfile` — self or internal key; optional `name`, `email`, `image`. Added `withProcedures` on user route.
- 2026-06-24 (LP-005d): `invite.revoke` — owner auth; sets `active: false`. Renamed invite builder to `withProcedures`.
- 2026-06-24 (LP-006a–e): Added `integration.connectInstallation` / `updateInstallation` procedures in new `router/integration.ts` (owner auth via `authorize`; internal key bypass for slack/discord/github bots). Extracted integration route from `router.ts`; denied generic `insert`/`update`. Renamed `externalEntity` builder to `withProcedures`. Migrated all web integration settings/redirect/activate flows and slack `installation-store`/`utils`, discord `utils`, github `setup.ts` off generic `mutate.integration.insert` / `.update`. Intentional: no optimistic handlers (OAuth / awaited `fetchClient`).
- 2026-06-24 (LP-007a–e): Renamed onboarding, documentationSource, agentChat builders to `withProcedures`; denied generic `insert`/`update` on all four routes. Added `documentationSource.syncCrawlProgress` + `runSyncCrawlProgress` helper (internal key only); migrated worker `crawl-documentation.ts`. Added `runRecordAutonomousAction` helper; `autonomousAction.record` procedure and `autonomous-receipts.ts` converge on shared helper. Intentional: `seedFake` dev procedure still inserts directly (dev-only fake rows with backdated `appliedAt`).
- 2026-06-24 (LP-008): Cross-route lockdown audit — all 17 product routes deny generic `insert`/`update`; four internal exception families documented with call sites. No code changes required; prior lockdown slices (003n, 004e, 005e, 006e, 007e) sufficient.
- 2026-06-24 (LP-008, user correction): **No generic mutations anywhere** — internal-key-only generic mutators are not allowed. Added `pipelineIdempotencyKey.{upsert,invalidate,batchUpsert}` and `pipelineJob.{create,patch}`; denied generic writes on `allowlist` and `subscription`; migrated worker pipeline callers. Direct `db.*` / `storage.*` inside the API process remains fine.
- 2026-06-24 (LP-010b partial): `authorize.ts` extended with `PortalSession` on context, `authorizeThreadCreate`, `getPortalAuthor`, `getWorkspaceActor`, `requireInternalApiKey`, `assertInternalKeyForIntegrationFields`. `threads.ts` property procedures use `getWorkspaceActor` after `authorize`; `thread.create` uses `authorizeThreadCreate`; internal-only procedures use `requireInternalApiKey`.
- 2026-06-24 (LP-010b partial): Added `allowPortalUser`, `getCallerUserId`, `resolveHumanAuthor`, `assertIntegrationAuthor`. `message.create` uses `allowPortalUser: true` (fixes portal composer auth). `markAsAnswer` keeps org-only fallback for non-thread-authors.

## PR Feedback

- 2026-06-21 (PR #292, cubic-dev-ai): `externalIssueId` must reject empty strings — **applied** in `cbe5b63` (`z.string().min(1)` on `linkIssueInputSchema`).
- 2026-06-21 (PR #292, cubic-dev-ai): Optimistic `externalEntity` label lookups must filter by `organizationId` — **applied** in `cbe5b63` (`linkIssue` / `unlinkIssue` handlers in `live-state.ts`).
- 2026-06-23 (PR #299, cubic-dev-ai): Thread-read enqueue warn must not fire when worker jobs intentionally disabled in prod — **applied** in `bc89935` (`areWorkerJobsEnabled()` guard in `hooks.ts`).

## Verification Ledger

- 2026-06-21: Not run. Reason: created the planning ledger only; no production code changed.
- 2026-06-21: LP-001 inventory verified by ripgrep across `apps/{api,web,worker,slack,discord,github,cli}` for `mutate.*`, `fetchClient.mutate.*`, `store.mutate.*`, and API `db.*` write paths in router + signal handlers. No typecheck or runtime exercise — documentation-only session.
- 2026-06-21 (LP-002): Contract cross-checked against `agents/saved-prompts/update-routers.md`, `authorize.ts`, `labels.ts`, `threads.ts`, `external-entity.ts`, and `apps/web/src/lib/live-state.ts`. Documentation-only — no typecheck run.
- 2026-06-21 (LP-003 partial): `bun run --filter api typecheck` and `bun run --filter web typecheck` pass. Ripgrep confirms web status/priority/assign paths use `mutate.thread.setStatus|setPriority|assignUser`; remaining generic `thread.update` in `pull-requests.tsx`, `archive/$id.tsx`, `threads/$id/index.tsx`, `quick-actions.tsx` (`markDuplicate`). No runtime UI smoke test.
- 2026-06-21 (LP-003b): `bun run --filter api typecheck` and `bun run --filter web typecheck` pass. Ripgrep: `issues.tsx` has zero `mutate.thread.update` / `mutate.update.insert`. No runtime UI smoke test for issue link/unlink combobox.
- 2026-06-21 (LP-003c): `bun run --filter api typecheck` and `bun run --filter web typecheck` pass. Ripgrep: `pull-requests.tsx` has zero `mutate.thread.update` / `mutate.update.insert`. No runtime UI smoke test for PR link/unlink combobox.
- 2026-06-21 (LP-003d): `bun run --filter api typecheck` and `bun run --filter web typecheck` pass. Ripgrep: `quick-actions.tsx` has zero `mutate.thread.update` / `mutate.update.insert`. No runtime UI smoke test for duplicate accept in Support Intelligence panel.
- 2026-06-21 (LP-003e): `bun run --filter api typecheck` and `bun run --filter web typecheck` pass. Ripgrep: `threads/$id/index.tsx` and `archive/$id.tsx` have zero `mutate.thread.update`. No runtime UI smoke test for archive/restore flows.
- 2026-06-22 (LP-003f): `bun run --filter api typecheck` pass. Ripgrep: `close.ts` has no `insertThreadActivity`; apply path uses `runSetThreadStatus`. No runtime test for close action in autonomous bundle rollback.
- 2026-06-22 (LP-003g): `bun run --filter api typecheck` and `bun run --filter worker typecheck` pass. Ripgrep: `apps/worker/src` has zero `mutate.thread.update` / `thread.update` for agentRead. No runtime synthesis pipeline smoke test.
- 2026-06-22 (LP-003h): `bun run --filter web typecheck` pass. Ripgrep: `apps/web` has zero `mutate.thread.insert` / `mutate.message.insert` / `mutate.author.insert`. No runtime devtools smoke test for create/duplicate flows.
- 2026-06-22 (LP-003i): Verified no `mutate.thread.create` (synced) callers in `apps/web` — only `fetchClient.mutate.thread.create`. Documentation-only decision; no code change beyond matrix.
- 2026-06-22 (LP-003j): `bun run --filter api typecheck` pass; `bunx tsc --noEmit` in `apps/slack` blocked on missing `@types/node` (pre-existing). Ripgrep: `apps/slack` has zero `mutate.thread.insert` / `mutate.message.insert` / `mutate.author.insert`. No runtime Slack ingest smoke test.
- 2026-06-22 (LP-003k): `bun run --filter api typecheck` and `apps/discord` `bun run typecheck` pass. Ripgrep: `apps/discord` has zero generic thread/message/author inserts. `thread.update` for archived status sync remains (LP-003m). No runtime Discord ingest smoke test.
- 2026-06-22 (LP-003l): `bun run --filter api typecheck` and `apps/github` `bun run typecheck` pass. Ripgrep: `apps/github` has zero `thread.update` / `update.insert`. No runtime GitHub issue/PR close webhook smoke test.
- 2026-06-22 (LP-003m): `bun run --filter api typecheck` and `apps/discord` `bun run typecheck` pass. Ripgrep: `apps/discord` and `apps/slack` have zero `thread.update`. No runtime Discord channel re-add backfill smoke test.
- 2026-06-23 (LP-003n): `bun run --filter api typecheck` and `apps/discord` `bun run typecheck` pass. `apps/slack` `bunx tsc --noEmit` blocked on missing `@types/node` (pre-existing). Ripgrep: zero `mutate.(thread|message|author).(insert|update)` under `apps/` (comment-only match in `threads.ts`). No runtime outbound Slack/Discord message sync smoke test.
- 2026-06-23 (LP-003o): `bun run --filter api typecheck` pass. Ripgrep: zero `.withHooks(` under `apps/api`. No runtime message-ingest / thread-read enqueue smoke test.
- 2026-06-23 (LP-004a): `bun run --filter api typecheck` pass. Ripgrep: single `db.insert(schema.update)` in `update-mutations.ts`; `insertThreadActivity` delegates to `runRecordActivity`. No runtime smoke test for GitHub issue creation timeline or autonomous undo activity rows.
- 2026-06-23 (LP-004b): `bun run --filter api typecheck` pass. Ripgrep: `apps/slack` has zero `mutate.update.update` / `mutate.update.insert`. No runtime Slack timeline replication smoke test.
- 2026-06-23 (LP-004c): `bun run --filter api typecheck` and `bun run --filter discord typecheck` pass. Ripgrep: `apps/discord` has zero `mutate.update.update` / `mutate.update.insert`. No runtime Discord timeline replication smoke test.
- 2026-06-23 (LP-004d): `bun run --filter api typecheck` pass. Ripgrep: `apply-label.ts` has no `threadLabel.insert` / direct label lookup — only `runAttachLabelToThread` + compensate `threadLabel.update`. No runtime inline-suggestion label apply smoke test.
- 2026-06-24 (LP-004e): `bun run --filter api typecheck` pass. Ripgrep: zero `mutate.update.insert` / `mutate.update.update` under `apps/web`, `apps/slack`, `apps/discord`, `apps/github`; slack/discord use `update.markReplicated` only. No runtime smoke test.
- 2026-06-24 (LP-005a): `bun run --filter api typecheck` and `bun run --filter web typecheck` pass. Ripgrep: zero `mutate.organization.update(` in `apps/web`. No runtime smoke test for org profile, digest, or custom-instructions settings forms.
- 2026-06-24 (LP-005b–e): `bun run --filter api typecheck` and `bun run --filter web typecheck` pass. Ripgrep: zero `mutate.(organization|organizationUser|user|invite).(update|insert)(` under `apps/web`, `apps/api`, `apps/slack`, `apps/discord`, `apps/github`. No runtime smoke test for team role/remove/revoke or user profile save.
- 2026-06-24 (LP-006a–e): `bun run --filter api typecheck`, `bun run --filter web typecheck`, `apps/discord` and `apps/github` `bun run typecheck` pass. `apps/slack` `bunx tsc --noEmit` blocked on missing `@types/node` (pre-existing). Ripgrep: zero `mutate.integration.insert` / `mutate.integration.update` under `apps/`. Generic `integration` `insert`/`update` denied in `router/integration.ts`; `externalEntity` uses `withProcedures`. No runtime smoke test for OAuth connect flows or slack installation-store.
- 2026-06-24 (LP-007a–e): `bun run --filter api typecheck`, `bun run --filter worker typecheck`, and `bun run --filter web typecheck` pass. Ripgrep: zero `mutate.(onboarding|documentationSource|agentChat|autonomousAction).(insert|update)` under `apps/web`, `apps/worker`, `apps/api`. Zero `withMutations` under `apps/api`. Single `db.autonomousAction.insert` bypass sites: `autonomous-action-mutations.ts` helper + dev-only `seedFake` procedure. No runtime smoke test for onboarding, documentation crawl, agent chat, or autonomous receipt flows.
- 2026-06-24 (LP-008): `bun run typecheck` (root, 10 packages) pass. Ripgrep across `apps/api/src/live-state` confirms all routes use `insert: () => false` and `update.preMutation/postMutation: () => false`; zero internal-key generic writes remain. Ripgrep across `apps/`: zero `mutate.<resource>.(insert|update)(` call sites; worker pipeline uses named `fetchClient.mutate.pipeline*` procedures only. No runtime smoke test.
- 2026-06-24 (LP-008 pipeline lockdown): `bun run --filter api typecheck` and `bun run --filter worker typecheck` pass. Ripgrep: zero `mutate.<resource>.(insert|update)(` under entire repo; zero `insert: ({ ctx })` in live-state router. No runtime worker pipeline smoke test.
- 2026-06-24 (LP-010b partial, `threads.ts`): `bun run --filter api typecheck` pass. Ripgrep: `threads.ts` has zero `throw new Error("UNAUTHORIZED")` and zero `portalSession` / `session?.userId` ad-hoc checks (one intentional `req.context?.internalApiKey` branch in `setStatus`). No runtime smoke test for portal thread create or property procedures.
- 2026-06-24 (LP-010b partial, `message.ts`): `bun run --filter api typecheck` pass. Added `allowPortalUser`, `getCallerUserId`, `resolveHumanAuthor`, `assertIntegrationAuthor` to `authorize.ts`. `message.ts` migrated; `markAsAnswer` intentionally omits `allowPortalUser` on org fallback (non-author portal users stay denied). No runtime portal composer smoke test.
- 2026-06-24 (LP-009a): `bun run typecheck` (root, 10 packages) pass. Ripgrep: zero `mutate.<product>.insert(` under `apps/`; zero generic `mutate.(thread|message|author|organization|organizationUser|user|invite|integration|onboarding|documentationSource|agentChat|autonomousAction|update).update(` — only `mutate.label.update` (named `label.update` procedure). Worker uses `pipelineIdempotencyKey.{upsert,invalidate,batchUpsert}` and `pipelineJob.{create,patch}` only. Zero `withMutations` under `apps/api`; zero `insert: ({ ctx })` in live-state router.
- 2026-06-24 (LP-009b): Smoke test matrix documented below. No runtime UI/integration exercise this session — gaps listed per path.
- 2026-06-24 (LP-010a): Authorization scan complete — 12 files with ad-hoc patterns tagged; zero `orgUsers.find` outside `authorize.ts`. Documented in **LP-010a scan results** section. No code changes.

### LP-009b smoke test matrix

| Area | Path / procedure | Expected behavior | Runtime tested | Gap |
| --- | --- | --- | --- | --- |
| Inbox | Thread list load + navigation | Threads sync via Live-State; no console mutation errors | no | Needs authenticated session |
| Thread properties | `thread.setStatus` / `setPriority` / `assignUser` | Properties panel updates optimistically; timeline row appears | no | Prior slices verified typecheck + ripgrep only |
| Thread properties | `thread.linkIssue` / `unlinkIssue` | Issues combobox links/unlinks; optimistic label resolution | no | — |
| Thread properties | `thread.linkPullRequest` / `unlinkPullRequest` | PR combobox links/unlinks | no | — |
| Thread | `thread.archive` / `thread.restore` | Archive navigates away; restore from archive page | no | `restore` has no optimistic handler (intentional) |
| Thread | `thread.markDuplicate` | Support Intelligence duplicate accept | no | — |
| Labels | `label.create` / `update` / `attachToThread` / `detachFromThread` | Settings labels CRUD + thread chip attach/detach | no | `label.update` is named procedure (not generic) |
| Composer | `message.create` / `markAsAnswer` | Reply editor + portal mark-as-answer | no | — |
| Settings | `organization.updateSettings` | Org profile / digest / custom instructions save | no | — |
| Settings | `organizationUser.updateMember` / `invite.revoke` | Team role toggle, member remove, invite revoke | no | — |
| Settings | `user.updateProfile` | User profile save | no | — |
| Integrations | `integration.connectInstallation` / `updateInstallation` | Slack/Discord/GitHub OAuth connect flows | no | — |
| Onboarding | `onboarding.*` | First-steps checklist progression | no | — |
| Documentation | `documentationSource.*` | Add/recrawl/delete source | no | — |
| Worker | `documentationSource.syncCrawlProgress` | Crawl status updates in settings UI | no | — |
| Slack/Discord | `thread.create` / `message.create` / `message.setExternalMessageId` | Inbound message ingest + outbound external id sync | no | — |
| GitHub | `thread.setStatus` webhook | Issue/PR close updates linked threads | no | — |
| Pipeline | `pipelineIdempotencyKey.*` / `pipelineJob.*` | Worker thread ingestion completes | no | — |

**Recommended manual pass before merge:** inbox navigation → change status/priority/assign on one thread → attach/detach label → archive thread → settings org name save → team role toggle.

### LP-010a scan results (2026-06-24)

Ripgrep across `apps/api/src` for ad-hoc auth. **`authorize()` already used** in: `router.ts` (org-family procedures), `labels.ts`, `integration.ts`, `threads.ts` (most property procedures), `message.ts` (partial), `update.ts` (`recordActivity`), `autonomous-action.ts` (`record`/`undo`), `signals/thread-procedures.ts`.

| File | Pattern | Count / notes | Tag |
| --- | --- | --- | --- |
| `live-state/router/threads.ts` | `portalSession` + `userId` match on `thread.create` | Portal customer creates thread; inline session checks + many `throw UNAUTHORIZED` on property procedures that already call `authorize` for redundant guards | **extend-util** — add `portalSession` / `allowPortalUser` to `authorize.ts`; **migrate** duplicate throws after `authorize` |
| `live-state/router/threads.ts` | `internalApiKey` guards on `setAgentRead`, `list`, integration-only fields | Internal-key-only procedures | **extend-util** — `authorize(req, { allowInternalApiKeyOnly: true })` or keep `requireInternalApiKey` helper folded into `authorize.ts` |
| `live-state/router/threads.ts` | `fetchRelatedThreads` manual `authorized` + `orgUsers` loop | Query auth not using `authorize` | **migrate** |
| `live-state/router/message.ts` | `portalSession` author resolution on `create` | Portal composer passes author from session | **extend-util** — portal actor helper beside `authorize` |
| `live-state/router/message.ts` | `markAsAnswer` inline session + membership | Partial `authorize` usage | **migrate** |
| `live-state/router/message.ts` | `setExternalMessageId` internal-key guard | Worker/integration only | **extend-util** — internal-key-only option |
| `live-state/router/agent-chat.ts` | `!req.context?.session?.userId` + `throw UNAUTHORIZED` | All draft/chat procedures (~15 sites) | **migrate** — use `authorize` with self-session or new `requireSessionUser` helper in `authorize.ts` |
| `live-state/router/onboarding.ts` | Repeated `internalApiKey \|\| session` + `orgUsers.find` per procedure | 4 procedures × same block | **migrate** — single `authorize(req, { organizationId })` per handler |
| `live-state/router/documentation-sources.ts` | Same pattern as onboarding + `syncCrawlProgress` internal guard | 5 write procedures + 1 internal | **migrate** / **extend-util** for internal-only |
| `live-state/router/external-entity.ts` | `upsert`/`softDelete` internal-key; `syncFromGithub` manual authorized | Mixed internal + member | **migrate** queries; fold internal guards into `authorize.ts` |
| `live-state/router/update.ts` | `markReplicated` internal-key-only | 2 sites | **extend-util** |
| `live-state/router/autonomous-action.ts` | `seedFake`/`clearFake` dev internal guard; `record` uses `authorize` | Dev procedures | **extend-util** for dev-only internal |
| `live-state/router/pipeline.ts` | Local `requireInternalApiKey` helper | 5 procedure entry points | **extend-util** — move helper to `authorize.ts` |
| `live-state/router.ts` | `organization.create` / `invite.accept` / `invite.decline` manual authorized blocks | Org bootstrap flows | **migrate** |
| `live-state/router.ts` | `user` read rule `isSelf \|\| isInternal` | Collection read permission | **extend-util** — `isAuthorized` self-or-internal variant |
| `live-state/router/labels.ts` | `getAuthorizedOrganizationIds` for query scoping | Not membership throw — org list filter | **intentional-exception** (query scoping); consider folding into `authorize.ts` as `getAuthorizedOrgIds(ctx)` |
| `live-state/factories.ts` | `publicRoute` session-or-internal check | Factory for public queries | **intentional-exception** until `authorize.ts` exposes query-scoping helper |
| `lib/signals/thread-procedures.ts` | `authorize` ✓ but `actorUserId` from `req.context?.session` with extra throw | Signal handlers | **migrate** — derive actor via `authorize.ts` helper after auth |
| `lib/authorize.ts` | Canonical `authorize` / `isAuthorized` | — | **keep** |

**`orgUsers.find` outside `authorize.ts`:** zero direct sites (only inside `authorize.ts`). Onboarding/documentation-sources duplicate membership logic via inline `orgUsers` iteration — counts as **migrate**.

**Priority for LP-010b (by call volume / duplication):** `threads.ts` (portal + redundant throws) → `agent-chat.ts` → `onboarding.ts` + `documentation-sources.ts` → `router.ts` org bootstrap → `message.ts` portal → `external-entity.ts` queries.

## Session Log

- 2026-06-21: Created ledger for migrating `apps/api` Live-State writes to explicit custom procedures and coupling web-used procedures with optimistic handlers. Initial repository scan identified the main API route files and existing web mutation call sites.
- 2026-06-21: Updated project terminology and operating instructions to target `withProcedures` instead of `withMutations`.
- 2026-06-21: Updated scope so all repository call sites migrate to procedures, with optimistic mutations only for `apps/web`.
- 2026-06-21 (LP-001): Built full write inventory matrix in this ledger — 16 product routes + 5 internal-only routes + API-internal signal/agent paths. Key findings: `thread.update` + `update.insert` are the densest generic web pattern; slack/discord still generic-insert threads/messages; several families use legacy `withMutations`; `autonomous-receipts.ts` bypasses `autonomousAction.record`; optimistic coverage is strong for `label` and partial for `message`/`thread` signals only.
- 2026-06-21 (LP-002): Added **Target procedure contract** — naming, Zod inputs, `authorize` rules, return values, shared helpers, web optimistic criteria, LP-008 lockdown table, and per-slice planned procedure catalog for LP-003–LP-007.
- 2026-06-21 (LP-003 partial): Implemented `thread.setStatus`, `thread.setPriority`, `thread.assignUser` in `apps/api/src/lib/thread-mutations.ts` + `router/threads.ts`; refactored `set-status` signal handler; migrated web call sites (`actions/threads.ts`, `properties.tsx`, command palette, toolbar, quick-actions status accept); added optimistic handlers in `live-state.ts`.
- 2026-06-21: Added **PR slices** section — LP-003 split into 14 slices (003a–n), LP-004–007 into 4–6 slices each, LP-008–009 into audit/verification slices. Updated checklist to reference child slices.
- 2026-06-21 (LP-003b): Implemented `thread.linkIssue` / `unlinkIssue` — `runLinkIssue` / `runUnlinkIssue` in `thread-mutations.ts`, procedures in `router/threads.ts`, migrated `issues.tsx`, optimistic handlers in `live-state.ts`.
- 2026-06-21 (LP-003c): Implemented `thread.linkPullRequest` / `unlinkPullRequest` — `runLinkPullRequest` / `runUnlinkPullRequest` in `thread-mutations.ts`, procedures in `router/threads.ts`, migrated `pull-requests.tsx`, optimistic handlers in `live-state.ts`.
- 2026-06-21 (LP-003d): Implemented `thread.markDuplicate` — `runMarkDuplicate` in `thread-mutations.ts`, procedure in `router/threads.ts`, migrated `quick-actions.tsx` duplicate accept, refactored `mark-duplicate` signal handler, optimistic handler in `live-state.ts`.
- 2026-06-21 (LP-003e): Implemented `thread.archive` / `thread.restore` — `runArchiveThread` / `runRestoreThread` in `thread-mutations.ts`, procedures in `router/threads.ts`, migrated `threads/$id/index.tsx` and `archive/$id.tsx`, optimistic `archive` handler in `live-state.ts`.
- 2026-06-22 (LP-003f): Refactored `close.ts` to delegate apply to `runSetThreadStatus`; added compensate snapshot (first-write-wins) mirroring `set-status.ts`.
- 2026-06-22 (LP-003g): Added `runSetAgentRead` + `thread.setAgentRead` procedure (internal key); migrated worker `persistAgentRead` and `apply-synthesis-autonomy.ts` call sites.
- 2026-06-22 (LP-003h): Migrated `duplicate-thread-command.tsx` to `thread.create`; deleted unused `create-thread-button.tsx` (superseded by `create-thread-dialog.tsx`).
- 2026-06-22 (LP-003i): Assessed `thread.create` optimistic need — none; documented intentional omission in matrix.
- 2026-06-22 (LP-003j/k): Extended `thread.create` / `message.create` for integration ingest; migrated `apps/slack/src/index.ts` and `apps/discord/src/index.ts` to procedures. Removed `getOrCreateAuthor` + `author.insert` paths; first-message realtime uses atomic `thread.create` (drops 150ms sleep).
- 2026-06-22 (LP-003l): Extended `thread.setStatus` for internal API key + integration activity fields; migrated `apps/github/src/webhooks/index.ts` `resolveLinkedThreads` to `store.mutate.thread.setStatus`.
- 2026-06-22 (LP-003m): Migrated Discord `backfillMessages` status sync to `fetchClient.mutate.thread.setStatus`; confirmed Slack has no `thread.update` call sites.
- 2026-06-23 (LP-003n): Locked generic `thread`/`message`/`author` writes; added `message.setExternalMessageId`; migrated Slack/Discord outbound sync. Files: `router/threads.ts`, `router/message.ts`, `router.ts`, `apps/slack/src/index.ts`, `apps/discord/src/index.ts`.
- 2026-06-23: Recorded operating instruction to migrate deprecated `withHooks` → `defineHooks` + `server({ hooks })` (documentation only; no code change this session).
- 2026-06-23 (LP-003o): Migrated `message.afterInsert` to `live-state/hooks.ts` (`defineHooks`); wired `server({ hooks })` in `index.ts`; removed `.withHooks` from `router/message.ts` and `router/threads.ts` (dropped dead `thread.afterInsert` shortId hook). Files: `hooks.ts`, `index.ts`, `router/message.ts`, `router/threads.ts`.
- 2026-06-23: Added **LP-010** (authorization scan + migrate) and operating instruction to centralize on `authorize.ts` (ledger only).
- 2026-06-23 (LP-004a): Added `update.recordActivity` procedure and `runRecordActivity` helper; migrated all API-internal timeline inserts. Files: `update-mutations.ts`, `router/update.ts`, `signals/activity.ts`, `thread-mutations.ts`, `router/threads.ts`, `router/autonomous-action.ts`.
- 2026-06-23 (LP-004b): Added `update.markReplicated` procedure; migrated Slack `handleUpdates` off generic `update.update`. Files: `update-mutations.ts`, `router/update.ts`, `apps/slack/src/index.ts`.
- 2026-06-23 (LP-004c): Migrated Discord `handleUpdates` off generic `update.update` to `update.markReplicated`. Files: `apps/discord/src/index.ts`.
- 2026-06-24 (LP-004e): Denied generic `insert`/`update` on `update` collection route; product callers already on thread procedures or `markReplicated`; internal timeline writes use `runRecordActivity` only.
- 2026-06-23 (LP-004d): Extracted `runAttachLabelToThread` in `label-mutations.ts`; `label.attachToThread` procedure and `apply-label` signal handler delegate to shared helper (transaction + race handling). Added `transaction` to `SignalExecutionDb`.
- 2026-06-24 (LP-004e): Denied generic `insert`/`update` on `router/update.ts` (`insert: () => false`, `update.preMutation/postMutation: () => false`). Confirmed no remaining product/integration generic callers — GitHub webhooks use `thread.setStatus`; slack/discord use `update.markReplicated`. Files: `router/update.ts`.
- 2026-06-24 (LP-005a): Added `organization.updateSettings` procedure (owner auth via `authorize`); renamed organization builder to `withProcedures`. Migrated web org profile, digest, and custom-instructions forms. Files: `router.ts`, `settings/organization/index.tsx`, `support-intelligence.tsx`.
- 2026-06-24 (LP-005b–e): Added `organizationUser.updateMember`, `user.updateProfile`, `invite.revoke`; renamed `organizationUser` and `invite` builders to `withProcedures`; added `withProcedures` on `user`. Migrated `team.tsx` and `settings/user/index.tsx`. Denied generic writes on all four org-family routes. Files: `router.ts`, `team.tsx`, `settings/user/index.tsx`.
- 2026-06-24 (LP-006a–e): Added `integration.connectInstallation` / `updateInstallation` in `router/integration.ts`; extracted integration route from `router.ts`; denied generic writes; renamed `externalEntity` to `withProcedures`. Migrated web slack/discord/github settings + redirects + `activate.ts`; slack `installation-store.ts`/`utils.ts`; discord `utils.ts`; github `setup.ts`.
- 2026-06-24 (LP-007a–e): Renamed onboarding, documentation-sources, agent-chat to `withProcedures`; denied generic writes. Added `documentation-source-mutations.ts` (`syncCrawlProgress`) + worker migration. Added `autonomous-action-mutations.ts` (`runRecordAutonomousAction`); converged `autonomous-receipts.ts` and `autonomousAction.record` procedure. Files: `router/onboarding.ts`, `router/documentation-sources.ts`, `router/agent-chat.ts`, `router/autonomous-action.ts`, `lib/autonomous-action-mutations.ts`, `lib/documentation-source-mutations.ts`, `lib/signals/autonomous-receipts.ts`, `apps/worker/src/handlers/crawl-documentation.ts`.
- 2026-06-24 (LP-008): Cross-route generic-write audit — verified all 17 product routes deny generic `insert`/`update`; documented internal exceptions (`pipeline*`, `subscription`, `allowlist`, `migration`) with call sites in new **LP-008 audit results** section. No production code changes. Files: `docs/plans/custom-route-mutations.md` only.
- 2026-06-24 (LP-008 pipeline lockdown): Added `lib/pipeline-mutations.ts`, `router/pipeline.ts` (`pipelineIdempotencyKey.{upsert,invalidate,batchUpsert}`, `pipelineJob.{create,patch}`); denied generic writes on `allowlist`, `subscription`, pipeline routes in `router.ts`; migrated worker `idempotency.ts` and `persistence.ts` off generic `mutate.*.(insert|update)`.
- 2026-06-24 (LP-010b partial): Extended `authorize.ts`; migrated `threads.ts` auth to shared helpers. Zero ad-hoc `UNAUTHORIZED` / portal checks remain in `threads.ts`.
- 2026-06-24 (LP-010b partial): Migrated `message.ts` — `allowPortalUser` for `message.create`; `resolveHumanAuthor` / `getCallerUserId` / `requireInternalApiKey`. Files: `authorize.ts`, `router/message.ts`.
- 2026-06-24 (LP-009a–b): Repo-wide static verification — `bun run typecheck` pass; ripgrep confirms zero generic product-route `insert`/`update` call sites (`label.update` is named procedure). Documented LP-009b smoke test matrix with runtime gaps. Files: `docs/plans/custom-route-mutations.md` only.
- 2026-06-24 (LP-010a): Authorization scan across `apps/api/src` — tagged ad-hoc patterns in 12 files; priority order for LP-010b documented. Files: `docs/plans/custom-route-mutations.md` only.
- 2026-06-24 (LP-010b partial): Extended `authorize.ts` with portal/workspace helpers (`authorizeThreadCreate`, `getPortalAuthor`, `getWorkspaceActor`, `requireInternalApiKey`, `assertInternalKeyForIntegrationFields`). Migrated `live-state/router/threads.ts` off ad-hoc auth. Files: `authorize.ts`, `router/threads.ts`.

## Handoff

Next action: Continue **LP-010b** — migrate `onboarding.ts` and `documentation-sources.ts` (same duplicated `internalApiKey || session` + `orgUsers` pattern). Replace with `authorize(req, { organizationId })` per procedure. Run `bun run --filter api typecheck` after changes.
