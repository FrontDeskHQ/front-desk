---
name: fd-seed
description: Seed realistic local-dev support threads using the fd CLI. Use when asked to seed threads, create test data, populate the inbox, or generate believable support fixtures for development.
license: MIT
metadata:
  author: front-desk
  version: "1.0"
---

# Seed support threads with `fd`

Use agent intelligence to author varied, believable thread fixtures, then seed them through the local `fd` CLI. The CLI is dumb pipes; this skill is the realism playbook.

## When to use

- "Seed threads", "create test data", "populate inbox"
- Need realistic inbox content for UI or pipeline work
- Testing thread list, detail, search, or worker synthesis locally

## Prerequisites

1. `bun dev` running (API + web)
2. `DISCORD_BOT_KEY` in `apps/api/.env.local` (CLI reads it automatically)
3. CLI built: `bun run --filter cli build`
4. Optional defaults in `apps/cli/.env.local`:
   - `FD_DEV_ORG=acme`
   - `FD_API_URL=http://localhost:3333/api/ls`
   - `FD_WEB_URL=http://localhost:3000`

## Flow

1. **Invent fixtures** — write varied, realistic opener threads (see guidelines below)
2. **Write JSON** — single object or array to a temp file (e.g. `/tmp/seed-threads.json`)
3. **Run CLI** — parse stdout JSON for created thread URLs/ids
4. **Verify** — threads appear in the inbox with correct title, author, and message

```bash
bun run --filter cli fd thread create --org acme --fixture /tmp/seed-threads.json
```

For a quick one-off without a file:

```bash
bun run --filter cli fd thread create \
  --org acme \
  --title "Webhook deliveries failing since yesterday" \
  --author "Priya Sharma" \
  --message "Our integration started returning 502s around 6pm UTC. Retries aren't helping."
```

During active CLI development, use `bun run --filter cli dev thread create ...` instead of `fd`.

## Fixture schema

Each entry requires three fields:

| Field | Type | Notes |
|-------|------|-------|
| `title` | string | Min 3 chars. Specific, customer-voice subject line |
| `author` | string | Display name only (e.g. `"Michael Chen"`) |
| `message` | string | Opening message body — plain text, first person |

```json
[
  {
    "title": "Can't export billing history as CSV",
    "author": "Jordan Lee",
    "message": "I'm trying to download invoices for our accountant but the export button spins forever. Chrome on macOS, started this morning."
  }
]
```

Authors dedupe by normalized name within an org (`fd-{orgId}-{name}` metaId).

## Realism guidelines

### Personas

Rotate believable customer types:

- **Individual user** — password resets, billing confusion, feature how-tos
- **Team admin** — seat limits, SSO, audit logs, permission errors
- **Developer integrator** — webhooks, API keys, rate limits, SDK bugs
- **Finance/procurement** — invoice mismatches, PO numbers, tax/VAT

### Tone

- First person, conversational, slightly imperfect
- Include one concrete detail (browser, timestamp, error snippet, plan tier)
- Match urgency to topic — billing/outage = stressed; feature ask = casual
- Avoid marketing speak and internal jargon

### Variety rules (especially for batches)

- **No duplicate root causes** in one batch (one login issue, one billing issue, etc.)
- **Mix urgencies**: at least one low, one medium, one high when seeding 5+
- **Mix topics**: auth, billing, integrations, bugs, feature requests
- **Vary message length**: short question vs. detailed repro steps
- **Different author names** — don't reuse the same persona unless intentional

### Anti-patterns

- Generic `"I have a problem with your product"` openers
- Identical sentence structure across threads
- All caps or all exclamation marks
- Lorem ipsum or obviously fake company names in every thread
- Copy-pasting Devtools `SAMPLE_THREADS` verbatim

## Example fixtures

### Billing batch (3 threads)

```json
[
  {
    "title": "Charged twice for the same renewal",
    "author": "Michael Chen",
    "message": "Our Pro plan renewed on March 1 and I see two identical $49 charges on the company card. Can you confirm whether one is a hold?"
  },
  {
    "title": "Need VAT number on invoices",
    "author": "Elena Rossi",
    "message": "We're in Italy and our finance team needs VAT IDs on every invoice before they can approve payment. Is there a field for that in billing settings?"
  },
  {
    "title": "Downgrade didn't apply at renewal",
    "author": "Sam Okonkwo",
    "message": "I switched us to Starter last week but today's receipt still shows Enterprise pricing. We only have 4 seats now."
  }
]
```

### Integration incident (single)

```json
{
  "title": "Slack replies not threading back",
  "author": "Alex Kim",
  "message": "Since we reconnected Slack yesterday, new messages land in the channel but don't attach to the existing FrontDesk thread. Thread ID in the payload looks correct."
}
```

## Output contract

Stdout is always JSON:

```json
{
  "created": [{ "id": "...", "title": "...", "shortId": 42, "url": "http://localhost:3000/support/acme/threads/42-..." }],
  "failed": [{ "index": 2, "title": "...", "error": "Title must be at least 3 characters" }]
}
```

- Exit `0` — all succeeded
- Exit `1` — one or more failed (partial success still listed under `created`)
- Use `--fail-fast` to stop on first error
- Use `--verbose` for stderr progress logs

## Pipeline note

Seeded threads behave like real user-created threads once the API enqueues the worker pipeline on `thread.create` (parallel fix, not CLI scope). Until then, threads appear in the inbox but may not trigger synthesis immediately.

## Related

- CLI README: `apps/cli/README.md`
- Plan: `docs/plans/devtool-cli.md`
- In-browser Devtools remain unchanged — CLI is a parallel, agent-friendly path
