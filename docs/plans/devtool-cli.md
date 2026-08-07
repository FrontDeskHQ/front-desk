# Plan: devtool CLI (`fd`) for agent-driven thread seeding

## Goal

A local-dev CLI plus companion agent skill that lets coding agents (Cursor, Claude Code) seed **realistic support threads** on demand — using agent intelligence instead of the 20 hardcoded `SAMPLE_THREADS` in the in-browser Devtools.

The CLI is dumb pipes; the skill teaches agents how to author believable fixtures and sequence customer turns. Callers own polling, timing, and semantic decisions.

## Phased scope

| Phase | Scope |
| --- | --- |
| **v1** | Fixture seeder — single-opener threads (`title`, `author`, `message`) |
| **v2** | Workflow driver — channel-aware create, read, and customer replies |
| **Later** | MCP server, multi-turn conversations, labels/links, dedicated dev auth header |

## Background / current state

- In-browser Devtools (`components/devtools/devtools-menu/create-thread-dialog.tsx`) can create threads via `fetchClient.mutate.thread.create`.
- **Single** tab: manual title/author, generic message (`"Thread created from devtools."`).
- **Random** tab: picks from 20 static `SAMPLE_THREADS` — stale, repetitive, not context-aware.
- `thread.create` accepts `internalApiKey` context (today via `x-discord-bot-key`
  - `DISCORD_BOT_KEY`) and `organizationId` in the payload.
- `message.create` and the CLI customer-reply mutation use the normal insert hook, so follow-up messages enqueue the worker pipeline.

## Package & invocation

- **Location**: `apps/cli`
- **Binary name**: `fd`
- **Run**: `bun run --filter cli dev thread create ...`
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

## Commands

```bash
# From fixture file (single object or array)
fd thread create --fixture ./threads.json
fd thread create --org acme --fixture ./threads.json

# Inline flags for quick one-offs
fd thread create --title "..." --author "Michael Chen" --message "..."

# Read a thread and poll incrementally
fd thread read <thread-id> [--org acme] [--after <message-id>]

# Continue as the original customer
fd thread reply <thread-id> --message "..."
fd thread reply <thread-id> --message-file ./follow-up.md
```

## Fixture schema

Validated with Zod in `apps/cli`.

```json
// single
{ "title": "...", "author": "Michael Chen", "message": "...", "channel": "portal" }

// batch
[
  { "title": "...", "author": "...", "message": "..." },
  { "title": "...", "author": "...", "message": "..." }
]
```

- `author` is display name only.
- `channel` is `slack`, `discord`, `widget`, or `portal`; it defaults to `portal`.
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
      "channel": "portal",
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

## Workflow behavior

- `thread read` returns normalized ordered messages, roles, channels, Markdown
  content, and a latest-message cursor. `--after` returns only newer messages.
- `thread reply` uses the original thread author and inserts through the normal
  message path, so the worker hook sees customer follow-ups.
- Replies use synthetic external IDs so local simulations cannot be delivered
  back through Slack or Discord outbound replication.
- There is no `wait` or scheduler command. The calling agent controls polling,
  timing, and the meaning of a relevant FrontDesk reply.

## Agent skill

- **Path**: `.agents/skills/fd-seed/SKILL.md`
- **Depth**: realism playbook — fixture schema, invocation, env setup, personas, tone guidelines, variety rules, anti-patterns (no duplicate root causes in a batch, mix urgencies/topics), and 2–3 example fixtures.
- **Triggers**: "seed threads", "create test data", "populate inbox".
- **Flow**: invent varied fixtures → write JSON → `bun run --filter cli dev thread create --fixture …` → parse stdout JSON; use `thread read --after` and `thread reply` for multi-turn flows.

## Devtools (in-browser)

- **Unchanged in v1** — CLI is a parallel path. Random tab and `SAMPLE_THREADS` stay for now. Removing Random is a possible follow-up.

## Implementation sketch

1. Add the shared `CustomerChannel` schema and use it in CLI fixtures and the internal message mutation.
2. Extend `thread.create` invocation with `externalOrigin` and opening-message `origin`.
3. Add the internal `message.createAsThreadAuthor` procedure with origin validation and synthetic external IDs.
4. Add CLI thread reference resolution, transcript normalization, incremental reads, and customer replies.
5. Document the workflow in the CLI README, `fd-seed`, and this plan.

## Verification

- `bun run --filter cli typecheck` and `bun run --filter cli lint` clean.
- With `bun dev` running (api + web): seed one thread via fixture file → appears in inbox with correct title, author, message.
- Batch fixture with one invalid entry → partial `created`/`failed` JSON, exit `1`.
- CLI refuses non-localhost `FD_API_URL`.
- Read returns normalized roles/content and supports `--after` cursors.
- Reply reuses the original customer author and rejects origin changes.
- Agent skill: ask Cursor to "seed 5 varied billing threads" → produces fixture JSON and successful `fd thread create` run.

## Explicitly out of scope

- MCP server
- Scenario fixtures and built-in scheduling/waiting
- Labels, status, assignee, external issue/PR links
- Staging/prod support
- Dedicated `FD_DEVTOOL_KEY` / `x-devtool-key` header
- Devtools UI changes (remove Random, paste-fixture tab)
- Semantic assertions and synthesis-specific commands
- Thread listing and additional portal actions
