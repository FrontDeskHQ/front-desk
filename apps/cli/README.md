# `fd` — FrontDesk devtool CLI

Local-dev CLI for seeding realistic support threads via Live-State. Primary consumer is coding agents; stdout is always JSON.

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
# Default org from FD_DEV_ORG
bun run --filter cli fd thread create --fixture ./threads.json

# Explicit org (slug or ULID)
bun run --filter cli fd thread create --org acme --fixture ./threads.json

# Inline one-off
bun run --filter cli fd thread create \
  --org acme \
  --title "Payment failed but money was deducted" \
  --author "Michael Chen" \
  --message "I tried to upgrade but the charge appeared on my card anyway."
```

## Fixture format

Single object or array:

```json
{ "title": "...", "author": "Michael Chen", "message": "..." }
```

```json
[
  { "title": "...", "author": "...", "message": "..." },
  { "title": "...", "author": "...", "message": "..." }
]
```

Authors use the `fd-{orgId}-{normalized-name}` metaId namespace (distinct from in-browser Devtools).

## Output

Stdout is JSON:

```json
{
  "created": [
    {
      "id": "...",
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

## Safety

Refuses to run when `FD_API_URL` is not localhost or `127.0.0.1`.
