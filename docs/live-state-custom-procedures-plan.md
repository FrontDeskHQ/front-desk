# Live-State: custom procedures plan (replace default `.insert` / `.update`)

## Policy: default collection `insert` / `update` are deprecated

**Generic collection mutations (`mutate.<collection>.insert`, `mutate.<collection>.update`) are deprecated and must not be used** — not in the web app, not in SSR, not in `**apps/worker`**, not in `**apps/discord`**, `**apps/slack**`, or `**apps/github**`, and not in devtools or one-off scripts that talk to Live-State.

- **All writes** go through **named procedures** on the router (`.withProcedures` only — do not use `.withMutations`), which perform authorization, validation, and any related rows in one place.
- **There is no “internal exception”** to using raw collection mutates. If the worker or an integration needs to write data, it calls the **same procedures** as everyone else (typically with `**internalApiKey`** context so `authorize` still passes). Convenience is not a reason to bypass procedures.
- **End state:** each collection route sets `**insert: () => false`** and `**update: false`** (or equivalent) so the deprecated APIs are **unavailable** at the protocol level, not merely discouraged.

Direct database access inside `**apps/api`** (outside the Live-State router) is a separate concern; this document is about **what may go through the sync router**.

---

This document maps **imported and inline routers** from `apps/api/src/live-state/router.ts`, sorted **from least to most product impact** (implement earlier items first if you need a phased rollout; the bottom sections are the core inbox).

**Scope (who must migrate off raw collection mutates):** Every app that talks to the router **except the API server’s non–Live-State code** — `**apps/web`**, `**apps/worker`**, `**apps/discord**`, `**apps/slack**`, `**apps/github**`.

**Cross-cutting rules (every new procedure):**

1. **Router wiring** — Register custom handlers with **`.withProcedures`** on the collection route (not `.withMutations`).
2. `**authorize(req.context, { organizationId, role?, allowPublicApiKey? })`** — use at the start of each handler after resolving `organizationId` from the target row (thread, label, integration, etc.). `isAuthorized` already treats `**internalApiKey`** as full access; worker and integration services use that context so the **same** procedures serve **browser sessions** and **trusted callers** without duplicating permission logic.
3. **Optimistic updates (web only)** — extend `defineOptimisticMutations` in `apps/web/src/lib/live-state.ts` for user-visible flows. `**apps/worker`** and **integration apps** call procedures via `**fetchClient.mutate.<procedure>`** (or the client’s equivalent); they do **not** use the web optimistic layer — they need a **stable procedure API** only.
4. **Turn off deprecated collection writes in the router** — after call sites migrate, `**insert: () => false`** and `**update: false`** (or stricter) on each collection so raw mutates cannot be invoked by any client.
5. **Web app: WebSocket `mutate` and `await` (`apps/web` only)** — The **`mutate`** client from `**~/lib/live-state`** is the browser WebSocket sync client. **Do not add new `await`s** on WebSocket **`mutate`** calls when writing new code or migrating call sites; prefer chaining the returned promise (**`.then()`** / **`.catch()`** / **`.finally()`**) and relying on **optimistic handlers** plus **pre-assigned ids** where ordering matters. **Existing** **`await mutate...`** in the repo may **stay as-is**—do not refactor files only to strip those awaits. Do **not** use the **`void`** operator on **`mutate`** calls (no **`void mutate...`**). **`await fetchClient.mutate`** remains valid in **server functions**, SSR, and **worker / integration** apps — this `await` policy applies only to the WebSocket **`mutate`** API.
6. **Procedure `db` access (`apps/api` Live-State handlers)** — Prefer the **collection-scoped** API on **`db`**, not schema-first helpers. **Do not** use **`db.insert(schema.collection, …)`**, **`db.find(schema.collection, …)`**, **`db.findOne(schema.collection, …)`**, **`db.update(schema.collection, …)`**, and similar **`db.<low-level>(schema.*, …)`** forms in new or touched procedure code. **Do** use **`db.<collection>.insert`**, **`db.<collection>.update`**, **`db.<collection>.where`**, **`db.<collection>.first`**, **`db.<collection>.one`**, **`trx.<collection>.*`** inside transactions, etc., so reads and writes go through the typed collection entry points. Same rule inside **`db.transaction(async ({ trx }) => …)`** with **`trx.<collection>.*`**.

**Naming:**

- **Only replaces `insert`** → `**create**` (no extra nouns in the name).
- **Only replaces `update`** → `**update**` — reuse the same procedure name as the deprecated collection mutation; Live-State wires your custom handler instead of the default, so you do **not** need a distinct name like `updateEntry`.
- **Replaces both**, or **replaces `update` plus** audit rows, suggestions, timeline, etc. → keep a **semantic** name (`assign`, `setStatus`, `upsert`, …).
- **Multiple `update`-only shapes** on one collection → one `**update`** with a **discriminated input**, **or** split by concern if a single payload is too wide.

Invoked as `**mutate.<collection>.<name>`** — collection disambiguates (`**mutate.author.create`** vs `**mutate.thread.create`**).

---

## 1. `pipelineIdempotencyKey` / `pipelineJob` (inline)

**Role:** Worker pipeline only; collections are internal-API–gated.

**Usage:** `**apps/worker`** — `pipeline/core/idempotency.ts` (`pipelineIdempotencyKey` insert/update), `pipeline/core/persistence.ts` (`pipelineJob` insert/update). No `apps/web` usage.

**Proposed procedures (replace `insert` / `update` on these collections):**

- `**pipelineIdempotencyKey`:** `**upsert`** (insert + update in one flow); `**release`** (optional; or fold into `**upsert`**).
- `**pipelineJob`:** `**create`** (enqueue job row); `**update`** (job status / metadata).

**Optimistic:** None (worker-only). `**internalApiKey`** for auth.

---

## 2. `allowlist`

**Role:** Email allowlist rows.

**Usage:** No Live-State mutates from worker or integration apps; **web** does not call insert/update (router already internal-API only).

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — `{ email }` (or batch), `**internalApiKey`** / admin-only; replaces `**insert`**.
- `**update**` — revoke / soft-delete / metadata changes; replaces the deprecated collection `**update**`.

Until product needs UI, keep collections closed and implement only when required.

---

## 3. `subscription`

**Role:** Billing / plan state.

**Usage:** No `mutate.subscription.*` in web, worker, or integration apps from this plan’s grep; payment code may use other paths.

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — if a row must be created through the router; replaces `**insert`**.
- `**update`** — webhook sync, plan/status/customer/seats, etc.; discriminated payload; replaces the deprecated collection `**update**` (and merges what used to be `**seats**`-only changes).

**Insert** remains disallowed on the generic collection except via `**create`** when needed.

---

## 4. `author`

**Role:** Message authors (user/meta/portal).

**Usage:**

- `**apps/web`:** Devtools / deprecated — `mutate.author.create` (`create-thread-button.tsx`, `create-thread-dialog.tsx`, `thread-input-area-deprecated/index.tsx`). Follow cross-cutting rule 5 for WebSocket **`mutate`** / **`await`** / **`void`**.
- `**apps/discord` / `apps/slack`:** `fetchClient.mutate.author.create` when ensuring a Discord/Slack-linked author (`discord/src/index.ts`, `slack/src/index.ts`).

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — idempotent get-or-create for `(organizationId, userId)` after `authorize`; replaces `**insert`**.
- `**update`** — name/avatar overrides; replaces collection `**update**`.

**Optimistic (`live-state.ts`):** Partially overlaps today’s `message.create` optimistic block (author + message). Align storage updates when `**author.create`** is called standalone.

---

## 5. `invite`

**Role:** Org invitations.

**Usage:**

- `**apps/web`:** `fetchClient.mutate.invite.accept` / `decline` (already custom); `**mutate.invite.update`** — `team.tsx` (e.g. cancel/revoke).
- **Worker / Discord / Slack / GitHub:** No raw `invite` mutates found outside web.

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — bulk invite rows (today partly via `**organizationUser.inviteUser`**); replaces `**insert`**.
- `**accept**`, `**decline**`, `**cancel**` — already custom or new; each replaces `**update**` for that transition (or fold into `**update**` with `{ action }` if you want a single custom `**update**` only).

**Optimistic:** Update local `invite` row and any list UI that shows pending invites.

---

## 6. `documentationSource`

**Role:** Crawled docs for AI.

**Usage:**

- `**apps/web`:** Custom mutations only — `fetchClient.mutate.documentationSource.*` (`documentation.tsx`).
- `**apps/worker`:** `**fetchClient.mutate.documentationSource.update`** — `handlers/crawl-documentation.ts` (crawl progress, status, errors).

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — add a source (already exists as `**add`** under a longer name); replaces `**insert`**.
- `**update**` — crawler progress (`setProgress`), owner metadata (`patch`), soft-delete (`delete`); discriminated payload; `**internalApiKey**` for worker paths; `**authorize**` for owner paths; replaces the deprecated collection `**update**`.
- `**validate**`, `**recrawl**` — not raw `**insert`/`update**` (validation + job trigger); keep as separate procedures.

**Optimistic (web):** Optional for `**create`** / recrawl / delete flows in settings UI.

---

## 7. `agentChat` / `agentChatMessage`

**Role:** Thread-scoped AI assistant.

**Usage:** `**apps/web`** only for mutations — `playground/index.tsx` (`agentChat.create`, `sendMessage`). Default insert/update disabled on collections.

**Proposed procedures (replace `insert` / `update`):**

- `**agentChat`:** `**create`** — replaces `**insert`**; `**update`** — draft fields only if split from `**updateDraft**`; `**sendMessage**`, `**acceptDraft**`, `**dismissDraft**` — semantic (not just raw `**update**`).
- `**agentChatMessage`:** `**create`** — rows inserted by `**sendMessage`**; `**update`** — streaming/tool JSON (discriminated payload); replaces the deprecated collection `**update**`.

Refactor inline checks to `**authorize**`. **Optimistic UX** for streaming is optional.

---

## 8. `onboarding`

**Role:** Org onboarding checklist.

**Usage:** `**apps/web` only** — `mutate.onboarding.*` and `fetchClient` in `use-onboarding.ts`. No worker/integration usage.

**Router:** After migration, `**insert: () => false`** and `**update: false`** on the `onboarding` collection.

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — seed onboarding row; replaces `**insert`** (today `**initialize`**).
- `**update**` — steps / skip / complete status; replaces the deprecated collection `**update**` (today `**completeStep**`, `**skip**`, `**complete**` — merge into one custom `**update**` with `**action**` or keep separate if you prefer explicit RPC names over a single `**update**` only).

Centralize auth with `**authorize**` in each handler. **Optimistic:** Step completion / skip can update local `onboarding.stepsStr` / `status`.

---

## 9. `user`

**Role:** Profile (name, image, etc.).

**Usage:** `**apps/web`** — `**mutate.user.update`** — `settings/user/index.tsx`. No worker/integration usage.

**Proposed procedures (replace `insert` / `update`):**

- `**update`** — restricted profile fields; replaces collection `**update`** (no end-user `**insert**`).

**Optimistic:** Patch `storage.user` for edited fields.

---

## 10. `organizationUser`

**Role:** Membership and roles.

**Usage:**

- `**apps/web`:** `**mutate.organizationUser.update`** — `team.tsx`; `**fetchClient.mutate.organizationUser.inviteUser`** (custom).
- **Worker / integrations:** None found for this collection.

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — bulk invite flow / membership row where applicable; replaces `**insert`** (today `**inviteUser`**).
- `**update**` — `role`, `enabled`, and other member fields; discriminated or partial payload; replaces the deprecated collection `**update**`.

**Optimistic:** Update the member row in local store; reconcile on error.

---

## 11. `organization`

**Role:** Org settings, branding, instructions.

**Usage:**

- `**apps/web`:** `**mutate.organization.update`** — `organization/index.tsx`, `support-intelligence.tsx`; custom `**create`**, `**createPublicApiKey`**, `**revokePublicApiKey**`, `**listApiKeys**` — `api-keys.tsx`, onboarding.
- `**apps/web` server fns:** `fetchClient` queries in `server-funcs/payment.ts`, `invitations.tsx` (read-heavy; not org mutates).
- **Worker / integrations:** No `organization` mutates found outside web.

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — already exists; replaces `**insert`** for new orgs.
- `**update`** — name, slug, logo, socials, `customInstructions`, billing fields, etc.; one validated partial payload (or discriminated **section**); replaces the deprecated collection `**update`**.
- `**createPublicApiKey`**, `**revokePublicApiKey**`, `**listApiKeys**` — already custom (API keys are not generic org `**insert`/`update**`).

Each calls `**authorize(..., { organizationId, role: "owner" })**` where appropriate.

**Optimistic:** Patch `storage.organization` for the changed subset.

---

## 12. `integration`

**Role:** Slack, Discord, GitHub, etc.

**Usage:**

- `**apps/web`:** `mutate.integration.insert` / `update` — integration index pages, `lib/integrations/activate.ts`, OAuth redirects (Discord/Slack/GitHub).
- `**apps/github`:** `fetchClient.mutate.integration.update` — `routes/setup.ts`.
- `**apps/discord` / `apps/slack`:** `fetchClient.mutate.integration.update` — `lib/utils.ts`, Slack `lib/installation-store.ts` (install/uninstall token flows).

**Proposed procedures (replace `insert` / `update`):**

- `**upsert`** — default connect/OAuth path; replaces `**insert`** + `**update`** together.
- `**create**` / `**update**` — only if you split from `**upsert**`: `**create**` replaces `**insert**`; `**update**` replaces the deprecated collection `**update**` (`enabled`, `configStr`, tokens).

**Optimistic:** Match local `integration` row to the procedure payload.

---

## 13. Labels router (`label` + `threadLabel`)

**Role:** Org label definitions and thread ↔ label links.

**Usage:**

- `**apps/web`:** `**mutate.label.insert` / `update`** — `labels.tsx`; `**mutate.threadLabel.insert` / `update`** — `labels.tsx`, `quick-actions.tsx`, `support-intelligence.tsx`, etc.
- **Worker / Discord / Slack / GitHub:** No direct label mutates found (labels flow via UI + suggestion pipeline).

**Proposed procedures (replace `insert` / `update`):**

`**label`**

- `**create`** — replaces `**insert`**.
- `**update**` — name/color/enabled/archive; replaces the deprecated collection `**update**`.

`**threadLabel**`

- `**create**` — attach label to thread; replaces `**insert**`.
- `**update**` — enable/disable link row; replaces the deprecated collection `**update**`.
- `**setTags**` (optional) — bulk replace; replaces multiple `**create**` / custom `**update**` calls in one call (not “just” insert or update — keep semantic name).

**Optimistic:** Mirror label and threadLabel rows; roll back on failure.

---

## 14. `suggestion`

**Role:** AI suggestions (status, duplicate, PR, related threads, labels).

**Usage:**

- `**apps/web`:** Widespread `**mutate.suggestion.update`** / insert (devtools) — `signal/index.tsx`, `quick-actions.tsx`, `support-intelligence.tsx`, `linked-pr-suggestions-section.tsx`, `add-pr-suggestion-command.tsx`.
- `**apps/worker`:** `**fetchClient.mutate.suggestion.insert` / `update`** — `pipeline/processors/suggest-status.ts`, `suggest-labels.ts`, `suggest-duplicates.ts`, `lib/database/client.ts`, `handlers/match-pr-threads.ts`, `handlers/digest-scan.ts`.

**Proposed procedures (replace `insert` / `update`):**

- `**upsert`** — worker/LLM ingest; replaces `**insert`** / `**update`** from pipeline.
- `**create**` — devtools / manual insert only; replaces `**insert**` where not covered by `**upsert**`.
- `**update**` — dismiss, pick, link, UI state; discriminated `**action**`; replaces the deprecated collection `**update**` (or keep `**dismiss`/`pick`/`link**` as sugar on top of custom `**update**`).

**Optimistic:** Update or remove suggestion rows in web local store; often paired with thread procedures below.

---

## 15. `update` (thread activity / audit timeline)

**Role:** Append-only activity rows (`type`, `metadataStr`, …).

**Usage:**

- `**apps/web`:** **Many** `mutate.update.insert` calls **paired with** `thread.update` — `actions/threads.ts`, `properties.tsx`, `issues.tsx`, `pull-requests.tsx`, `linked-pr-suggestions-section.tsx`, `quick-actions.tsx`, `signal/index.tsx`, etc.
- `**apps/github`:** `**store.mutate.update.insert`** — `webhooks/index.ts` (issue/PR closed → resolve linked threads + GitHub-sourced timeline row with `replicatedStr`).
- `**apps/discord` / `apps/slack`:** `**fetchClient.mutate.update.update`** — patch an existing timeline row (`discord/src/index.ts`, `slack/src/index.ts`).

**Proposed procedures (replace `insert` / `update` on the `update` collection):**

- **Preferred:** No public `**insert`/`update`** on `update` — rows come from `**thread`** / `**message`** procedures (§17, §16) in the same transaction.
- `**create**` — append a timeline row when not folded into `**thread.setStatus**` etc.; replaces `**insert**` (today often named `**log**`).
- `**update**` — rare row edits (e.g. Discord/Slack fixups); replaces the deprecated collection `**update**` on the `**update**` timeline collection (same procedure name, custom handler).

GitHub webhooks should call `**mutate.thread.setStatus**` (or `**mutate.update.create**`) — never raw `**update.insert**`.

**Optimistic (web only):** Append a local `update` row with a temporary id when the paired thread optimistic update runs (or only patch thread if timeline can refresh lazily).

---

## 16. `message`

**Role:** Thread messages.

**Usage:**

- `**apps/web`:** `**mutate.message.create`** — `reply-editor.tsx` (optimistic in `live-state.ts`); `**mutate.message.insert`** — deprecated UI, devtools, `duplicate-thread-command.tsx`; `**fetchClient.mutate.message.markAsAnswer`**, `**create**` — portal `support/.../$id.tsx`; `**message.search**` — search route.
- `**apps/discord` / `apps/slack`:** `**store.mutate.message.insert`** and `**message.update`** — `discord/src/index.ts`, `slack/src/index.ts` (sync chat into threads).

**Proposed procedures (replace `insert` / `update`):**

- `**create`** — primary path + devtools/duplicate seed; replaces `**insert`** (use input flags for dev vs prod if needed).
- `**update`** — edits to existing message body/flags **without** side effects on thread (rare); replaces the deprecated collection `**update`**.
- `**answer`** — mark as answer + thread status (not “just” `**update**` — semantic).
- `**sync**` — Discord/Slack mirror (insert + update in one flow — semantic).
- `**search**` — read-only.

**Optimistic:** Already partially implemented for `**create`** / `**answer`**.

---

## 17. `thread` (highest impact)

**Role:** Core entity for the product.

**Usage:**

- `**apps/web`:** `**mutate.thread.update`** — assignment, status, priority, externals, `deletedAt`, duplicates, etc.; `**mutate.thread.insert`** / `**fetchClient.mutate.thread.insert`** — devtools, `duplicate-thread-command.tsx`; `**thread.create**` and GitHub fetch/create helpers — already procedures.
- `**apps/github`:** `**store.mutate.thread.update`** — `webhooks/index.ts` (linked issue/PR closed → set status resolved + timeline); OAuth `**routes/setup.ts`** touches `**integration`** only.
- `**apps/discord` / `apps/slack`:** `**store.mutate.thread.insert`** and `**fetchClient.mutate.thread.update`** — create/link threads for bridge traffic (`discord/src/index.ts`, `slack/src/index.ts`).

**Proposed procedures (replace `insert` / `update` on `thread`):**


| Procedure         | Replaces (conceptually)                            | Notes                                           |
| ----------------- | -------------------------------------------------- | ----------------------------------------------- |
| `**create`**      | `**insert`** only (API/portal/public key)          | Already exists.                                 |
| `**update`**      | generic field patch **without** audit side effects | Rare; most flows use semantic procedures below. |
| `**assign`**      | assignee + timeline                                | Not “just” `**update`**                         |
| `**setStatus`**   | status + timeline                                  | Not “just” `**update**`                         |
| `**setPriority**` | priority + timeline                                | Not “just” `**update**`                         |
| `**issue**`       | external issue + audit                             | Web                                             |
| `**pr**`          | external PR + audit                                | Web                                             |
| `**duplicate**`   | status + audit + suggestions                       | Web                                             |
| `**delete**`      | soft `deletedAt`                                   | Web                                             |
| `**restore**`     | clear `deletedAt`                                  | Web                                             |
| `**rename**`      | `name`                                             | If needed                                       |
| `**bridge**`      | Discord/Slack `**insert**`                         | `**internalApiKey**`                            |
| `**channel**`     | bridge metadata `**update**`                       | Discord/Slack                                   |


Each loads the thread (or org for create), applies `**authorize**` (session) **or** `**internalApiKey`**, and performs DB writes + audit in **one** transaction where callers today issue multiple mutates.

**Optimistic (`live-state.ts`, web only):** Implement each user-facing procedure name: patch `thread`, append `update` if the timeline is immediate, and update `suggestion` when bundled. **GitHub/Discord/Slack** rely on sync responses or WS replication — no extra optimistic layer in those apps.

---

## Suggested implementation order (within this doc)

Work **top to bottom** for low-risk cleanup; converge **thread + update + suggestion** across **web, worker, and GitHub webhooks** early — they all encode the same product semantics (status, timeline, suggestions) on different transports.

---

## Reference: legacy call sites to migrate (by app)

The lists below are **inventory to eliminate**. None of these patterns should survive; they all become `**fetchClient.mutate.<procedure>(...)`** / `**mutate.<procedure>(...)`** (and router-level `**insert`/`update` disabled**).

### `apps/web`

- **Thread + audit:** `actions/threads.ts`, `properties.tsx`, `issues.tsx`, `pull-requests.tsx`, `linked-pr-suggestions-section.tsx`, `quick-actions.tsx`, `signal/index.tsx`, `support-intelligence.tsx`, `threads/$id.tsx`, `archive/$id.tsx`.
- **Suggestions:** same + `add-pr-suggestion-command.tsx`.
- **Labels:** `labels.tsx`, `quick-actions.tsx`, `support-intelligence.tsx`.
- **Integrations:** `lib/integrations/activate.ts`, Discord/Slack/GitHub settings + redirects.
- **Org / team / user:** `organization/index.tsx`, `support-intelligence.tsx`, `team.tsx`, `user/index.tsx`.
- **Devtools / deprecated:** `create-thread-*.tsx`, `duplicate-thread-command.tsx`, `thread-input-area-deprecated/index.tsx`, `message.insert`.

### `apps/worker`

- `**pipelineIdempotencyKey` / `pipelineJob`:** `pipeline/core/idempotency.ts`, `pipeline/core/persistence.ts`.
- `**suggestion`:** `pipeline/processors/suggest-status.ts`, `suggest-labels.ts`, `suggest-duplicates.ts`, `lib/database/client.ts`, `handlers/match-pr-threads.ts`, `handlers/digest-scan.ts`.
- `**documentationSource`:** `handlers/crawl-documentation.ts`.

### `apps/discord` / `apps/slack`

- `**discord/src/index.ts`**, `**slack/src/index.ts`:** `author.insert`, `thread.insert`, `thread.update`, `message.insert`, `message.update`, `update.update`.
- `**discord/src/lib/utils.ts`**, `**slack/src/lib/utils.ts`**, `**slack/src/lib/installation-store.ts`:** `integration.update`.

### `apps/github`

- `**webhooks/index.ts`:** `thread.update`, `update.insert` (issue/PR closed).
- `**routes/setup.ts`:** `integration.update`.

---

## `authorize` import

Use the shared helper from `apps/api/src/lib/authorize.ts` in procedure handlers. `**internalApiKey`** must continue to satisfy `authorize` for worker and integration services. Ensure request context includes `orgUsers` (or equivalent) for **browser** calls — align with `**message.create`**, `**message.answer`**, and auth middleware.