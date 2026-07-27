# Plan: devtool CLI (`fd`) for agent-driven thread seeding

## Goal

A local-dev CLI plus companion agent skill that lets coding agents (Cursor, Claude Code) seed **realistic support threads** on demand — using agent intelligence instead of the 20 hardcoded `SAMPLE_THREADS` in the in-browser Devtools.

The CLI is dumb pipes; the skill teaches agents how to author believable fixtures. Seeded threads behave like real user-created threads (pipeline enqueue is a parallel API fix, out of scope for the CLI itself).

## Phased scope

| Phase | Scope |
| --- | --- |
| **v1** | Fixture seeder — single-opener threads (`title`, `author`, `message`) |
| **v2** | Workflow driver — post messages, wait for pipeline, assert on synthesis |
| **Later** | MCP server, multi-turn conversations, labels/links, dedicated dev auth header |

## Background / current state

- In-browser Devtools (`components/devtools/devtools-menu/create-thread-dialog.tsx`) can create threads via `fetchClient.mutate.thread.create`.
- **Single** tab: manual title/author, generic message (`"Thread created from devtools."`).
- **Random** tab: picks from 20 static `SAMPLE_THREADS` — stale, repetitive, not context-aware.
- `thread.create` accepts `internalApiKey` context (today via `x-discord-bot-key`
  - `DISCORD_BOT_KEY`) and `organizationId` in the payload.
- `message.create` enqueues the worker pipeline via `afterInsert`; `thread.create` inserts the first message via direct `trx.insert` and **does not** enqueue today. A parallel API fix will align behavior with real user creation.

## Package & invocation

- **Location**: `apps/cli`
- **Binary name**: `fd`
- **Run**: `bun run --filter fd thread create ...`
- **Pattern**: mirror `apps/discord/src/lib/live-state.ts` — `@live-state/sync/client/fetch` with `x-discord-bot-key`, workspace `api` dependency for `Router` types.

## Auth & safety

- **Environment**: local dev only.
- **Guard**: refuse to run unless `FD_API_URL` host is `localhost` or `127.0.0.1`.
- **Auth**: reuse `DISCORD_BOT_KEY` sent as `x-discord-bot-key` (same as Discord bot). Dedicated `FD_DEVTOOL_KEY` is a future rename, not v1.
- **Env vars**:

```
FD_API_URL=http://localhost:3333/api/ls
DISCORD_BOT_KEY=<same as apps/api>
FD_DEV_ORG=acme          # optional default org slug
```

## Org targeting

- `--org` accepts **slug or ULID** (detect by format).
- Falls back to `FD_DEV_ORG` when the flag is omitted.
- CLI resolves slug → `organizationId` via live-state query.
- Fail fast: `Organization not found: acme`.

## Commands (v1)

```bash
# From fixture file (single object or array)
fd thread create --fixture ./threads.json
fd thread create --org acme --fixture ./threads.json

# Inline flags for quick one-offs
fd thread create --title "..." --author "Michael Chen" --message "..."
```

## Fixture schema

Validated with Zod in `apps/cli`.

```json
// single
{ "title": "...", "author": "Michael Chen", "message": "..." }

// batch
[
  { "title": "...", "author": "...", "message": "..." },
  { "title": "...", "author": "...", "message": "..." }
]
```

- `author` is display name only.
- CLI derives author `metaId`: `fd-{orgId}-{normalizedName}` (lowercase, spaces → hyphens). Distinct from Devtools' `devtools-{orgId}-…` namespace.
- Same name across batch calls dedupes to one author row (API finds existing `metaId`).

## Output contract

- **stdout**: JSON always (primary consumer is the coding agent).
- **stderr**: errors and optional `--verbose` progress logs.
- **Batch**: continue on error by default; `--fail-fast` stops on first failure.
- **Exit code**: `0` if all succeeded, `1` if any failed.

```json
{
  "created": [
    {
      "id": "...",
      "title": "...",
      "shortId": 42,
      "url": "http://localhost:3000/support/acme/threads/..."
    }
  ],
  "failed": [
    {
      "index": 2,
      "title": "...",
      "error": "Title must be at least 3 characters"
    }
  ]
}
```

## Pipeline behavior

- **Out of CLI scope for v1** — no enqueue logic in the CLI.
- **Parallel work (separate PR)**: fix `thread.create` to enqueue the worker the same way `message.create` does. Benefits Devtools and CLI alike.
- **Skill documents**: seeded threads trigger the pipeline as if a real user created the thread (expected once the API fix lands).

## Agent skill

- **Path**: `.agents/skills/fd-seed/SKILL.md`
- **Depth**: realism playbook — fixture schema, invocation, env setup, personas, tone guidelines, variety rules, anti-patterns (no duplicate root causes in a batch, mix urgencies/topics), and 2–3 example fixtures.
- **Triggers**: "seed threads", "create test data", "populate inbox".
- **Flow**: invent varied fixtures → write JSON → `bun run --filter fd thread create --fixture …` → parse stdout JSON.

## Devtools (in-browser)

- **Unchanged in v1** — CLI is a parallel path. Random tab and `SAMPLE_THREADS` stay for now. Removing Random is a possible follow-up.

## Implementation sketch

1. Scaffold `apps/cli` with `package.json` (`name`: `cli`, `bin`: `fd`).
2. Add `src/lib/live-state.ts` — fetch client (copy Discord pattern).
3. Add `src/lib/org.ts` — resolve slug/ULID → `organizationId`, localhost guard.
4. Add `src/schema/thread-fixture.ts` — Zod schema (single object or array).
5. Add `src/commands/thread/create.ts` — validate, loop, call `fetchClient.mutate.thread.create`, emit JSON result.
6. Add `.agents/skills/fd-seed/SKILL.md` — realism playbook.
7. Document env vars in `apps/cli/README.md` or `apps/api/.env.local.example` comment.

## Verification

- `bun run --filter cli typecheck` and `bun run --filter cli lint` clean.
- With `bun dev` running (api + web): seed one thread via fixture file → appears in inbox with correct title, author, message.
- Batch fixture with one invalid entry → partial `created`/`failed` JSON, exit `1`.
- CLI refuses non-localhost `FD_API_URL`.
- Agent skill: ask Cursor to "seed 5 varied billing threads" → produces fixture JSON and successful `fd thread create` run.

## Explicitly out of scope (v1)

- MCP server
- Multi-turn / reply seeding
- Labels, status, assignee, external issue/PR links
- Staging/prod support
- Dedicated `FD_DEVTOOL_KEY` / `x-devtool-key` header
- Devtools UI changes (remove Random, paste-fixture tab)
- Pipeline enqueue in the CLI
- Shared fixture schema in `packages/schemas` (can extract later for Devtools)
