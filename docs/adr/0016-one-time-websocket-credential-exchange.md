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
- records which kind of principal it stands for.

A private-key token names its organization and source key; an internal-key token stays internal. On consumption the server rebuilds that principal and re-reads the private key, so one revoked or expired between minting and connecting is refused.

Better Auth session tokens keep their own exchange and storage. API-key tokens get separate server-only storage because they stand for organizations and internal services, not users.

Internal WebSocket clients cut over in one step; the old query-param key is dropped rather than kept alongside.

## Consequences

- Connectors run an HTTP exchange on every connect and reconnect.
- Revoking or expiring a private key kills its unconsumed tokens, but not sockets already open.
- API and connectors deploy separately, so connectors can fail for the length of the cutover.
- Nothing prunes spent or expired token rows yet.
