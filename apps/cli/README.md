# `fd` — FrontDesk devtool CLI

Local-dev CLI for seeding and driving realistic customer conversations via Live-State. Primary consumer is coding agents; successful commands write JSON to stdout.

## Setup

Ensure the API is running (`bun dev`) and copy env vars from `apps/api/.env.local`:

```bash
# apps/cli/.env.local (optional — also reads ../api/.env.local)
FD_API_URL=http://localhost:3333/api/ls
FD_WEB_URL=http://localhost:3000
DISCORD_BOT_KEY=<same value as apps/api>
FD_DEV_ORG=acme
```

Build the API once:

```bash
bun run --filter api build
```

The CLI itself runs straight from TypeScript via bun — no build step.

## Usage

```bash
# List all organizations (id, name, slug, support URL)
bun run --filter cli fd org list

# Default org from FD_DEV_ORG
bun run --filter cli fd thread create --fixture ./threads.json

# Explicit org (slug or ULID)
bun run --filter cli fd thread create --org acme --fixture ./threads.json

# Inline one-off
bun run --filter cli fd thread create \
  --org acme \
  --channel slack \
  --title "Payment failed but money was deducted" \
  --author "Michael Chen" \
  --message "I tried to upgrade but the charge appeared on my card anyway."

# Read a thread by ULID or (with --org) short ID
bun run --filter cli fd thread read 01j... --org acme
bun run --filter cli fd thread read 42 --org acme --after 01j...

# Append as the original customer
bun run --filter cli fd thread reply 01j... \
  --message "I retried after clearing the cache and it still fails."
bun run --filter cli fd thread reply 01j... --message-file ./follow-up.md
```

## Fixture format

Single object or array:

```json
{ "title": "...", "author": "Michael Chen", "message": "...", "channel": "portal" }
```

```json
[
  { "title": "...", "author": "...", "message": "...", "channel": "slack" },
  { "title": "...", "author": "...", "message": "...", "channel": "discord" }
]
```

`channel` is one of `slack`, `discord`, `widget`, or `portal`; it defaults to
`portal` for backwards compatibility. The value is stored on the thread and
each customer message.

Authors use the `fd-{orgId}-{normalized-name}` metaId namespace (distinct from in-browser Devtools).

## Output

Stdout is JSON:

```json
{
  "created": [
    {
      "id": "...",
      "channel": "slack",
      "title": "...",
      "shortId": 42,
      "url": "http://localhost:3000/support/acme/threads/42-payment-failed"
    }
  ],
  "failed": []
}
```

- Exit `0` when all threads succeed
- Exit `1` when any thread fails (partial batch results still printed)
- `--fail-fast` stops after the first failure
- `--verbose` logs progress to stderr

## Customer-side flow

`thread read` returns normalized, ordered messages with stable IDs, roles
(`customer`, `frontdesk`, or `unknown`), channel, timestamps, and Markdown
content. Save the returned `cursor` and pass it to `--after` on the next read;
an empty `messages` array means nothing new arrived. The calling agent owns
polling cadence, scheduling, and deciding whether a reply matters.

`thread reply` always uses the thread's original customer author. It accepts
exactly one of `--message` and `--message-file`. Replies inherit the thread's
channel; `--channel` is only needed to identify a legacy thread with no origin.
Changing a known thread origin is rejected.

## Safety

Refuses to run when `FD_API_URL` is not localhost or `127.0.0.1`.
