# Live-State: migrate CRUD + authorization to procedures (`authorize` helper)

This document plans migrating insert/update/read authorization and business logic toward **custom procedures** (`.withProcedures`) and the shared `**authorize()`** helper in `apps/api/src/lib/authorize.ts`, using `**apps/api/src/live-state/router/message.ts`** as the reference implementation.

## Reference pattern (`message.ts`)


| Concern                       | What to copy                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Procedures**                | Use `.withProcedures(({ mutation, query }) => ({ ... }))` for server-defined operations with Zod input schemas. (`threads.ts` also uses `query` for `list`.)                                                                                                                                         |
| **Collection route**          | Keep `.collectionRoute(schema.*, { read, insert, update })` only where Live-State **sync** must still allow filtered CRUD from clients (or internal/worker keys). Tighten over time: `insert: () => false` / `update: { preMutation/postMutation: () => false }` once every caller uses a procedure. |
| **Authorization in handlers** | Call `authorize(req.context, { organizationId, role?: "owner", allowPublicApiKey?: true })` at the start of procedures instead of ad-hoc `db.find(schema.organizationUser, …)` blocks.                                                                                                               |
| **Exceptions**                | When rules are not expressible as org membership (e.g. portal thread author vs agent), keep explicit checks **after** `authorize` where needed—see `markAsAnswer` in `message.ts`.                                                                                                                   |
| **Hooks**                     | Keep `withHooks` (e.g. `afterInsert`) for side effects that should stay tied to sync inserts if those remain.                                                                                                                                                                                        |


### `authorize` prerequisites

- `**orgUsers` on context**: Populated in `apps/api/src/index.ts` for authenticated dashboard sessions (`storage.find(organizationUser, …)` by `userId`). Procedures should prefer `authorize()` over repeating that query.
- **Gaps to address in the same effort**:
  - **Portal-only** WebSocket sessions may not get `orgUsers` the same way as dashboard sessions. Today, routers use explicit thread/org checks (e.g. `message.create`, `threads.create`). The plan should either attach `orgUsers` for portal when safe, or document which procedures must keep explicit DB checks.
  - `**publicApiKey`**: Supported via `allowPublicApiKey: true` when `ownerId` matches `organizationId` (see `authorize.ts`). Use consistently on procedures that must accept public API clients.
  - **Role checks**: Use `role: "owner"` in `authorize()` instead of manual `organizationUser.role === "owner"` queries (`router.ts` API key mutations, documentation flows, etc.).

### `withMutations` vs `withProcedures`

`@live-state/sync@0.0.7-canary-7` exposes both names as the same API; the API router **unifies on `withProcedures`** (see Phase 2). Prefer `withProcedures` for all new routes.

---

## Inventory: current state

### Already using `.withProcedures`


| File                | Notes                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router/message.ts` | `create`, `markAsAnswer`, `search`. Uses `authorize()` in `create` and conditional org auth in `markAsAnswer`. **Follow-up:** ensure `search` enforces org access (today it forwards `organizationId` to Qdrant without `authorize`). |
| `router/threads.ts` | `create`, `list` (query), GitHub helpers, etc. Several handlers still use manual `internalApiKey` + `organizationUser` queries; `list` has commented `authorize`. `fetchRelatedThreads` has TODO for auth.                            |


### Using `.withProcedures` (custom handlers on these routes)


| Location                          | Procedures / mutations                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `router.ts` — `organization`      | `create`, `createPublicApiKey`, `revokePublicApiKey`, `listApiKeys`                                                |
| `router.ts` — `organizationUser`  | `inviteUser`                                                                                                       |
| `router.ts` — `invite`            | `accept`, `decline`                                                                                                |
| `router/onboarding.ts`            | `initialize`, `completeStep`, `skip`, `complete`                                                                   |
| `router/documentation-sources.ts` | `validateDocumentationSource`, `addDocumentationSource`, `recrawlDocumentationSource`, `deleteDocumentationSource` |
| `router/agent-chat.ts`            | `create`, `sendMessage`, and related (large file)                                                                  |


### `collectionRoute` only (sync CRUD + built-in read/insert/update rules)

Defined inline in `router.ts` or split files:


| Entity                                  | File                              | Risk / notes                                                          |
| --------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `organization`                          | `router.ts`                       | Updates: owner via filters; `create` already a mutation.              |
| `organizationUser`                      | `router.ts`                       | Sync updates for team; invite flow.                                   |
| `user`                                  | `router.ts`                       | Self updates.                                                         |
| `author`                                | `router.ts`                       | Loose insert rules; TODO FRO-68.                                      |
| `invite`                                | `router.ts`                       | Complex read OR (org member vs email).                                |
| `integration`                           | `router.ts`                       | Owner-scoped insert/update.                                           |
| `allowlist`                             | `router.ts`                       | Email-scoped read; internal insert.                                   |
| `subscription`                          | `router.ts`                       | Owner read; internal update.                                          |
| `thread`                                | `threads.ts`                      | Sync insert/update for agents; `create` procedure exists.             |
| `message`                               | `message.ts`                      | Sync insert; internal-only update.                                    |
| `update`                                | `router/update.ts`                | Typing indicators / activity—sync insert/update.                      |
| `suggestion`                            | `router/suggestions.ts`           | Worker + dev insert; heavy client `mutate.suggestion.update`.         |
| `label`, `threadLabel`                  | `router/labels.ts`                | Broad UI usage.                                                       |
| `onboarding`                            | `router/onboarding.ts`            | Sync + mutations duplicating auth.                                    |
| `documentationSource`                   | `router/documentation-sources.ts` | Internal-only insert/update on collection; user-facing via mutations. |
| `agentChat`, `agentChatMessage`         | `router/agent-chat.ts`            | Insert disabled + mutations.                                          |
| `pipelineIdempotencyKey`, `pipelineJob` | `router.ts`                       | Worker/internal only.                                                 |


---

## Migration goals (ordered)

1. **Authorization consistency**
  Replace repeated patterns:
  - `let authorized = !!req.context?.internalApiKey` + `db.find(organizationUser, …)`  
   with `authorize(req.context, { organizationId, role: "owner" })` (or without `role` for any member), including:
  - `router.ts` (API keys),
  - `threads.ts` (GitHub mutations),
  - `onboarding.ts`, `documentation-sources.ts`, and any similar blocks.
2. **Procedure-first writes (all clients)**
  For each entity that still relies on sync `insert` / `update`:
  - Add explicit **mutation** procedures (naming: verb + entity, e.g. `applyLabel`, `recordTypingUpdate`) that perform `db.insert` / `db.update` inside the handler after `authorize`.
  - Update **all client apps** (`apps/web`, `apps/worker`, `apps/discord`, `apps/slack`, `apps/github`) from `mutate.<entity>.insert/update` to `mutate.<entity>.<procedure>(...)`.
  - Then set collection `insert` / `update` to `**false`** (or strictly internal-only where unavoidable) so auth is not split between collection filters and app code.
3. **Procedure-first reads where filters are insufficient**
  - Replace or supplement large `read: { … }` graph filters with `**query` procedures** when you need arguments (pagination already uses `threads.list`).  
  - For pure sync subscriptions, **keep** `read` filters until the client can move to queries + local state—treat as a later phase.
4. **Internal / worker paths**
  - `pipeline*`, worker `suggestion`/`documentationSource` updates: either keep `internalApiKey` bypass in `authorize` (already `true` for internal key) or dedicated `internalOnly` procedures that assert `internalApiKey` once at the top.
5. **Hardening**
  - Fix any procedure that takes `organizationId` without `authorize` (e.g. message `search`).  
  - Resolve TODOs: `threads` `list` + `fetchRelatedThreads` authorization.

---

## Suggested phases (execution order)

### PR checklist (copy into PR description)

- [x] **Phase 0** — Baseline (guideline + `mutate.*` inventory in this doc).
- [x] **Phase 1** — Low-risk `authorize()` refactors; `threads.list` + `message.search` guarded.
- [x] **Phase 2** — `withMutations` → `withProcedures` across API router; `bun run typecheck` on `api` passes.
- [ ] **Phase 3** — High-traffic sync → procedures for all clients; lock collection writes per entity (coordinate QA, in progress).
- [ ] **Phase 4** — Optional read-model / query migration.
- [ ] **Definition of done (global)** — no `mutate.<entity>.insert/update` usage remains in client apps (`apps/web`, `apps/worker`, `apps/discord`, `apps/slack`, `apps/github`) except explicitly documented temporary exemptions with owner + removal date.

### Phase 0 — Baseline

- Add a short **coding guideline** in the PR template or `CLAUDE.md`: new writes go through procedures + `authorize`. *(Done: see **Live-State authorization** in `CLAUDE.md`.)*
- List all `mutate.*.insert|update` usages across **all client apps** and attach to the ticket. *(Inventory below; regenerate with `rg 'mutate\\.\\w+\\.(insert|update)\\(' apps/web apps/worker apps/discord apps/slack apps/github`.)*

#### `mutate.*.insert` / `mutate.*.update` inventory (all clients)

**`apps/web`** — by collection (line counts are grep hits, not runtime frequency):

| Collection | Files (representative) |
| ---------- | ------------------------ |
| `author` | `components/devtools/.../create-thread-dialog.tsx`, `create-thread-button.tsx` |
| `integration` | `lib/integrations/activate.ts`, `settings/organization/integration/*` |
| `invite` | `settings/organization/team.tsx` |
| `label` | `settings/organization/labels.tsx`, `components/threads/labels.tsx` |
| `message` | `thread-input-area-deprecated`, devtools create/duplicate thread |
| `organization` | `settings/organization/index.tsx`, `support-intelligence.tsx` |
| `organizationUser` | `settings/organization/team.tsx` |
| `suggestion` | `signal/index.tsx`, `thread-toolbar/quick-actions.tsx`, `linked-pr-suggestions-section.tsx`, devtools |
| `thread` | Many thread UI routes and components (`$id.tsx`, `issues.tsx`, `properties.tsx`, devtools, etc.) |
| `threadLabel` | `labels.tsx`, `quick-actions.tsx`, `support-intelligence.tsx` |
| `update` | `issues.tsx`, `pull-requests.tsx`, `properties.tsx`, `signal/index.tsx`, quick-actions, linked-pr, etc. |
| `user` | `settings/user/index.tsx` |

**`apps/worker`**

| Collection | Files |
| ---------- | ----- |
| `documentationSource` | `handlers/crawl-documentation.ts` |
| `pipelineIdempotencyKey` | `pipeline/core/idempotency.ts` |
| `pipelineJob` | `pipeline/core/persistence.ts` |
| `suggestion` | `pipeline/processors/suggest-*.ts`, `handlers/digest-scan.ts`, `handlers/match-pr-threads.ts`, `lib/database/client.ts` |

**`apps/discord`, `apps/slack`, `apps/github`**

| App | Collections (representative) |
| --- | --- |
| `apps/discord` | `author`, `thread`, `message`, `update`, `integration` |
| `apps/slack` | `author`, `thread`, `message`, `update`, `integration` |
| `apps/github` | `thread`, `update`, `integration` |

#### Explicit file backlog (must migrate to custom procedures)

These files still contain `mutate.<entity>.insert/update` calls and require migration:

**`apps/web`**

- `apps/web/src/components/threads/thread-toolbar/quick-actions.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/integration/slack/redirect.ts`
- `apps/web/src/components/devtools/devtools-menu/duplicate-thread-command.tsx`
- `apps/web/src/lib/integrations/activate.ts`
- `apps/web/src/components/threads/thread-input-area-deprecated/index.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/support-intelligence.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/integration/github/index.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/integration/discord/index.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/integration/discord/redirect.ts`
- `apps/web/src/components/threads/linked-pr-suggestions-section.tsx`
- `apps/web/src/routes/app/_workspace/_main/signal/index.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/labels.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/integration/slack/index.tsx`
- `apps/web/src/components/threads/thread-input-area-deprecated/support-intelligence.tsx`
- `apps/web/src/routes/app/_workspace/settings/user/index.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/index.tsx`
- `apps/web/src/components/threads/properties.tsx`
- `apps/web/src/components/threads/issues.tsx`
- `apps/web/src/routes/app/_workspace/settings/organization/team.tsx`
- `apps/web/src/components/devtools/devtools-menu/create-thread-dialog.tsx`
- `apps/web/src/components/threads/labels.tsx`
- `apps/web/src/components/devtools/devtools-menu/add-pr-suggestion-command.tsx`
- `apps/web/src/routes/app/_workspace/_main/threads/$id.tsx`
- `apps/web/src/components/devtools/devtools-menu/create-thread-button.tsx`
- `apps/web/src/components/threads/pull-requests.tsx`
- `apps/web/src/routes/app/_workspace/_main/threads/archive/$id.tsx`

**`apps/worker`**

- `apps/worker/src/pipeline/core/persistence.ts`
- `apps/worker/src/handlers/digest-scan.ts`
- `apps/worker/src/handlers/crawl-documentation.ts`
- `apps/worker/src/pipeline/processors/suggest-duplicates.ts`
- `apps/worker/src/handlers/match-pr-threads.ts`
- `apps/worker/src/lib/database/client.ts`
- `apps/worker/src/pipeline/core/idempotency.ts`
- `apps/worker/src/pipeline/processors/suggest-labels.ts`
- `apps/worker/src/pipeline/processors/suggest-status.ts`

**`apps/discord`**

- `apps/discord/src/lib/utils.ts`
- `apps/discord/src/index.ts`

**`apps/slack`**

- `apps/slack/src/lib/installation-store.ts`
- `apps/slack/src/index.ts`
- `apps/slack/src/lib/utils.ts`

**`apps/github`**

- `apps/github/src/webhooks/index.ts`
- `apps/github/src/routes/setup.ts`

### Phase 1 — Low-risk auth refactors (no client rewrites)

- Swap manual org checks for `authorize()` in:
  - `router.ts` (public API key mutations),
  - `threads.ts` (GitHub-related mutations),
  - `onboarding.ts`, `documentation-sources.ts`.
- Uncomment and implement `authorize` on `threads.list` where `organizationId` is passed.
- Add `authorize` to `message.search`.

*(Done in the migration PR series.)*

### Phase 2 — Unify mutation APIs

- Rename `withMutations` → `withProcedures` where supported; ensure types and client exports still match.

*(Done: `router.ts`, `router/onboarding.ts`, `router/documentation-sources.ts`, `router/agent-chat.ts`; client call sites unchanged—procedure names and wire protocol are unchanged.)*

### Phase 3 — High-traffic sync migrations (coordinate with QA)

Order by dependency and blast radius:

1. `**update` collection** (typing / activity) → procedure(s), then lock collection writes. *(Partially done: web/dashboard writes migrated to `update.create`; remaining integration/client call sites must migrate too.)*
2. `**thread` / `message`** — reduce remaining `mutate.message.insert` call sites to `create` where possible; align portal + app.
3. `**label` / `threadLabel`** — procedures for add/remove/update; update labels UI.
4. `**suggestion**` — worker uses many inserts/updates; introduce `internal*` procedures or a single batch API to avoid dozens of round-trips; then restrict collection.
5. `**organization` / `organizationUser` / `invite` / `user**` — migrate settings and team flows.
6. `**integration` / `subscription` / `allowlist**` — settings and billing surfaces.

### Phase 4 — Optional read-model migration

- Only if product needs stricter isolation: narrow `read` filters and/or move list UIs to `query` procedures with explicit `authorize`.

---

## Testing checklist (per entity)

- Dashboard session with `orgUsers` (happy / wrong org / disabled user).  
- Portal session (support routes) where applicable.  
- `x-public-api-key` and WebSocket `publicApiKey` query param.  
- `internalApiKey` (Discord bot, worker).  
- Regression: Live-State sync still receives expected rows after tightening `read` (if changed).
- Repo-wide grep gate: `rg 'mutate\\.\\w+\\.(insert|update)\\(' apps/web apps/worker apps/discord apps/slack apps/github` returns zero matches (or only explicitly approved temporary exemptions).

---

## Open questions

1. Should `**portalSession**` load `**orgUsers**` (or a single org membership) server-side so `authorize()` applies uniformly?
2. For **worker-heavy** tables (`suggestion`, `pipelineJob`), do we prefer **one internal procedure** with batch input vs many small procedures?
3. ~~Confirm `withProcedures` and `withMutations` are interchangeable in `@live-state/sync@0.0.7-canary-7`~~ **Resolved:** same builder API; Phase 2 standardizes on `withProcedures` only in app code.

---

## File index (quick navigation)


| Area                 | Path                                        |
| -------------------- | ------------------------------------------- |
| Router composition   | `apps/api/src/live-state/router.ts`         |
| `authorize` helper   | `apps/api/src/lib/authorize.ts`             |
| Context (`orgUsers`) | `apps/api/src/index.ts` (`contextProvider`) |
| Reference            | `apps/api/src/live-state/router/message.ts` |
| Factories            | `apps/api/src/live-state/factories.ts`      |
