# 0021 — One public error contract: canonical code plus reason

**Status:** Accepted **Date:** 2026-09-22

## Context

Procedures threw `new Error("SOME_CODE")`. Live-State `1.0.0-canary-7` only exposes errors that are `PublicError` instances and masks everything else as `INTERNAL_SERVER_ERROR`. Before this change, HTTP clients (CLI, worker, connectors) already got `INTERNAL_SERVER_ERROR` for every failure, and WebSocket clients got the raw message string, which UI code then matched with `message.includes(...)`. Authentication and authorization failures were all reported as `UNAUTHORIZED`, even when the caller was signed in but not allowed.

## Decision

Throw `AppError` (from `apps/api/src/lib/errors.ts`, exported as `api/errors`) for every failure the caller should see. It has three parts:

- **`code`**: one of a small set of canonical codes tied to an HTTP status (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `TOO_MANY_REQUESTS`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE`, `GATEWAY_TIMEOUT`, plus Live-State's `VALIDATION_ERROR` and the masked `INTERNAL_SERVER_ERROR`). Clients use it for generic handling such as retrying, re-authenticating, or showing the message.
- **`details.reason`**: a stable SCREAMING_SNAKE identifier for the specific cause (`THREAD_NOT_FOUND`, `STALE_AGENT_READ`, `REPOSITORY_NOT_CONNECTED`). Clients branch on the reason, never on the message. `details` can also carry context such as `resource`, `id`, or the failing `action`.
- **`message`**: a sentence written for end users. It is shown in toasts as-is, so it never contains secrets or raw upstream responses.

Use the `errors.*` constructors for common cases. `UNAUTHORIZED` means the caller presented no credential or an invalid one. `FORBIDDEN` means the credential is valid but does not allow the action (`accessDenied()` in `authorize.ts` picks between them). Connector failures become `BAD_GATEWAY` or `GATEWAY_TIMEOUT`, and the connector's own `{ error }` code is kept as the reason.

Invariant violations and server misconfiguration stay as plain `Error`. They are logged on the server and reach clients as a masked `INTERNAL_SERVER_ERROR`.

Plain Express routes answer with the same `{ error: { code, message, status, details } }` envelope through `toErrorResponse()`.

## Consequences

- Clients use `getErrorReason`, `hasErrorCode`, and `getErrorMessage(error, fallback)` from `api/errors`. `getErrorMessage` never shows a masked or non-public message.
- The connection-token endpoint's error body changed from `{ error: "CODE" }` to the envelope. External widget code that read the string needs updating.
- Tests assert on `reason` or `code`, not on message text, so copy can change freely.
