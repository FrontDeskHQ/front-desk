# 0016 — Exchange long-lived API keys for one-time WebSocket tokens

**Status:** Accepted **Date:** 2026-08-10

## Context

Private and internal API keys authenticate ordinary HTTP requests through headers. WebSocket clients cannot set those headers during the upgrade, and putting a long-lived credential in the connection URL would expose it to logs, browser history, and other URL-capture surfaces.

Private and internal keys also represent different principals. A [private API key](../../CONTEXT.md#private-api-key) belongs to one organization, while an [internal API key](../../CONTEXT.md#internal-api-key) has global trusted privileges. Reusing one undifferentiated WebSocket credential context would let organization-owned keys inherit internal authorization.

## Decision

Exchange private and internal API keys for an opaque, one-time WebSocket connection token. The client presents its long-lived key in an HTTP header to the exchange endpoint; the server returns a token that:

- expires after 60 seconds;
- is stored only as a hash;
- is atomically consumed when opening one connection; and
- records the originating principal kind and authorization scope.

Private-key tokens identify the organization and source key. Internal-key tokens retain the distinct global internal principal. The server reconstructs that typed principal when consuming the token and revalidates private-key revocation and expiration before accepting the connection.

Better Auth session tokens continue through their existing exchange and storage. API-key connection tokens use separate server-only storage because they represent organization and internal principals rather than user sessions.

Internal WebSocket clients move to this exchange at a single hard cutoff; durable query-credential compatibility is not retained.

## Consequences

- Connectors perform an HTTP exchange on every connection and reconnection attempt.
- Revoking or expiring a private key invalidates its unconsumed connection tokens. Already-established sockets are not closed.
- Independently deployed API and connector clients can temporarily fail during the hard-cutoff rollout.
- Connection-token rows are retained; this decision introduces no expired-row cleanup mechanism.
