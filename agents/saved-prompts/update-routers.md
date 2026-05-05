## Refactor a live-state route to the new mental model

### 1. Procedures (replace default insert/update)

- Declare procedures with **`withProcedures`** (not `withMutations`).
- Procedures can be **mutations or queries**.
- Find **all** usages of default **`mutate.<collection>.insert` / `.update`** (and **`fetchClient`**, workers, etc.) before naming procedures.
- Use **semantic names**: `create`, `update`, `attachToThread`, `detachFromThread`, … — names that could become a **public API** someday; prefer specific names when behavior is stable.
- **Prefer one procedure per real operation** instead of branching in the UI when the server already handles it (e.g. one **`attachToThread`** that resolves by natural keys).

### 2. Authorization

- **`authorize`** should take **request-shaped input**: **`{ context?: AuthorizationContext | null }`** (**`AuthorizeReq`**) plus **`AuthorizeOptions`** — handlers call **`authorize(req, opts)`** with the mutation/query **`req`**.
- Keep **`isAuthorized(ctx, opts)`** for boolean checks with a plain context when needed.
- Extend **`AuthorizeOptions`** only when you need new rules (e.g. **`allowPublicApiKey`**, **`allowInternalApiKey`**, **`role`**).

### 3. Block default collection mutations

- **`insert`** / **`update`** (**pre/post**): make authorization **deny-by-default** (e.g. **`() => false`**) once custom procedures replace those paths.

### 4. Read path

- Keep **`read`** as today unless something else is required.

### 5. Web app: optimistic procedures

- In **`apps/web/src/lib/live-state.ts`**, **`defineOptimisticMutations`** for each **mutation** procedure the UI uses without awaiting (fire-and-forget).
- **Optimistic handlers** mirror the server: same collections and shapes; **`storage`** matches **`db`** behavior.

### 6. Migrate clients repo-wide

- Replace **`mutate.<resource>.insert|update`** with **`mutate.<resource>.<procedure>(...)`** everywhere (web, scripts, integrations).
- **Preserve await behavior**: do **not** add **`await`** if the original code did not await.

---

## Implementation habits

### Inserts / updates

- **`db.<collection>.insert(...)`** usually **returns the inserted row** — avoid an extra **`one(id).get()`** unless you need **`include`** or a different projection.
- **Updates**: live-state strips **`undefined`** from patches; **`null`** clears where the schema allows. Avoid redundant conditional spreads unless you confirmed the stack doesn’t already strip **`undefined`**.

### Shared logic

- Factor helpers that take **`db` | `trx`** (e.g. **`Pick<ServerDB<typeof schema>, "label">`** or minimal structural typing) so **create** and **transactions** reuse the same insert/update path.

### Route placement / naming

- Put procedures on the collection that owns the **product concept**, not necessarily every table touched (e.g. attach/detach UX on **`label`** while **`threadLabel`** stays read + blocked defaults).
- Use **paired, consistent names** (e.g. **`attachToThread`** / **`detachFromThread`** with **`detachFrom`** not **`detachTo`**).

### UI vs server

- If the procedure **`upsert`s by natural keys** and accepts optional **`id`** for optimistic reconciliation, prefer **one client call shape** (e.g. always pass **`id: ulid()`**): server ignores **`id`** when a row exists; optimistic path skips **`id`** on the “existing row” branch.

### Optimistic `update`

- Pass optional fields directly; **omit** manual **`...(x !== undefined ? …)`** if storage strips **`undefined`**.

---

## Verification

- Run **`bun run typecheck`** in **`apps/api`** and **`apps/web`** (and any app importing the router).
- Grep for leftover **`mutate.<collection>.insert`** / **`update`** for that resource.
- Sanity-check **internal API** vs **session** contexts for new procedures.

---

**Target:** `apps/api/src/live-state/router/<route>.ts` (and sibling client files). Apply only changes required by this refactor; avoid unrelated edits.