# `fd` — FrontDesk devtool CLI

Internal devtool for seeding realistic support threads via Live-State. Primary consumer is coding agents; stdout is always JSON.

`fd` authenticates with a [private API key](../../CONTEXT.md#private-api-key), so it acts **as one organization** — the one that owns the key. It can be pointed at any environment, including production.

## Why there is only one command

A private API key is deliberately narrow. `isAuthorized` in `apps/api/src/lib/authorize.ts` refuses private keys on every generic route; thread creation is the only procedure that accepts one, and it derives the organization from the key rather than from the request. So `fd` can create threads and nothing else — it cannot list organizations, read threads, or act across organizations. Widening that is a server-side authorization decision, not a CLI one.

There is **no environment guard**. `fd` will happily seed fabricated threads into a production organization if that is the profile you select. Choosing the right profile is the caller's responsibility.

## Setup

### 1. Mint a private API key

In the web app, as an **owner** of the target organization: Settings → Organization → API keys → create a private key. The key is shown once.

Locally the `private-api-keys` feature flag is bypassed server-side, so key creation works without Reflag. The web UI still gates the button on the client-side flag — flip it with Devtools.

### 2. Write a profile

`~/.config/fd/config.json` (override the path with `FD_CONFIG_PATH`):

```json
{
  "profiles": {
    "local": {
      "apiUrl": "http://localhost:3333/api/ls",
      "key": "fd_sk_..."
    },
    "prod": {
      "apiUrl": "https://api.tryfrontdesk.app/api/ls",
      "key": "fd_sk_..."
    }
  }
}
```

Each profile pairs an API origin with the key valid for it, so switching environments cannot leave a key pointed at the wrong host. Select one with `--profile <name>` or `FD_PROFILE`; the default is `local`.

### 3. Optional — org slugs for URLs

`fd` does not emit thread URLs, because it does not know its own organization's slug. If you want to compose one, put the slug in `apps/cli/.env.local` keyed by profile:

```bash
FD_LOCAL_ORG_SLUG=acme
FD_PROD_ORG_SLUG=your-org
```

Then build the URL yourself from a created thread:

```
{webUrl}/support/{orgSlug}/threads/{shortId}
```

The CLI never reads these variables.

### 4. Build the API once

```bash
bun run --filter api build
```

The CLI itself runs straight from TypeScript via bun — no build step.

## Usage

```bash
# Default profile (FD_PROFILE, else "local")
bun run --filter cli fd thread create --fixture ./threads.json

# Explicit profile
bun run --filter cli fd thread create --profile prod --fixture ./threads.json

# Inline one-off
bun run --filter cli fd thread create \
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

Authors use the `fd-{normalized-name}` metaId namespace (distinct from in-browser Devtools). The server scopes author lookup by organization, so the same name in two organizations stays two authors.

## Output

Stdout is JSON:

```json
{
  "created": [
    {
      "id": "...",
      "title": "...",
      "shortId": 42
    }
  ],
  "failed": []
}
```

- Exit `0` when all threads succeed
- Exit `1` when any thread fails (partial batch results still printed)
- `--fail-fast` stops after the first failure
- `--verbose` logs progress to stderr

A rejected key is not a per-thread failure: the run aborts immediately, naming the profile, rather than repeating the same credential error once per fixture.
