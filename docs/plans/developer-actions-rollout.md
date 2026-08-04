# Developer actions production rollout

This checklist covers FRO-213 / FRO-208. It verifies the internal developer
path without creating GitHub repositories, pull requests, issues, comments, or
other external test data.

## Security boundary

The Command K and toolbar checks are visibility checks only. The API must still
authorize every invocation before it resolves an integration, looks up a
mirrored entity, invokes a connector, or queues work.

| Caller | Local development | Production-like environment |
| --- | --- | --- |
| Authenticated member with a verified `@tryfrontdesk.app` address | Visible and accepted | Visible and accepted |
| Authenticated member with an unverified internal address | Visible and accepted | Hidden and denied |
| Authenticated member with an external address | Visible and accepted | Hidden and denied |
| Unauthenticated request | Hidden and denied | Hidden and denied |
| Authenticated user who is not a member of the selected organization | Hidden and denied | Hidden and denied |

For a denied request, verify the structured denial reason is one of
`missing_session`, `unverified_email`, `non_internal_email`, or
`not_organization_member`. The denial must happen before integration or target
lookup.

## Automated verification ledger

Run the focused suites from the repository root:

```sh
bunx vitest run \
  apps/api/src/lib/authorize.test.ts \
  apps/api/src/lib/developer-action-dispatch.test.ts \
  connectors/framework/src/invoke.test.ts \
  connectors/github/src/routes/actions.test.ts \
  connectors/github/src/lib/queue.test.ts \
  apps/web/src/lib/developer-tools/access.test.ts \
  apps/web/src/lib/developer-tools/github-selection.test.ts
```

The suites protect:

- exact internal-email matching, verification, membership, missing-session,
  and local-development behavior;
- organization-scoped integration and mirror-target resolution;
- unknown actions, missing integrations, invalid/foreign targets, connector
  failures, bounded connector timeouts, and redacted transport errors;
- open/non-draft PR eligibility, refresh-before-eligibility, replay queue
  coalescing, selected/all repository validation, and idempotent queue keys;
- Command K visibility, PR filtering, repository selection, and the explicit
  all-repositories payload.

## Production smoke test

Use an existing open, non-draft PR in an already connected GitHub repository.
Do not create or modify GitHub test data.

1. Sign in as a verified internal member and select the organization that owns
   the GitHub installation.
2. Open Command K with `mod+k`. Confirm the Developer tools entry and compact
   toolbar are visible. Confirm the active organization is the only source of
   PRs and repositories shown.
3. Open `Developer tools → GitHub → Replay GitHub PR match`. Confirm the picker
   contains only mirrored `open` and non-draft PRs. Select the existing PR.
4. Confirm the UI reports an accepted result with a queue identifier. Confirm
   core and connector logs include actor/organization/action/target/job context
   but never include the opaque integration configuration, installation secret,
   connector secret, or unrelated organization data.
5. Repeat the same replay. Confirm it uses the existing per-PR coalescing key
   and does not create a GitHub PR or historical webhook event.
6. Open `Developer tools → GitHub → Backfill GitHub repositories`. Select one
   configured repository and run the selected backfill. Confirm one accepted
   job is returned. Repeat it and confirm the deterministic repository key
   prevents duplicate pending work.
7. Run the explicit `Backfill all repositories` command only if the connected
   installation has multiple repositories. Confirm the result is marked
   `all`, and that each configured repository receives one idempotent job.
8. If a safe existing PR can be moved out of eligibility by normal workflow,
   verify a closed or draft PR refreshes the mirror but does not enqueue the
   match pipeline. Do not make a GitHub-only change solely for this checklist.
9. Sign out or switch to a non-member/external account. Confirm the toolbar and
   developer commands disappear; separately verify a direct API call is denied.

## Rollout exit criteria

- Focused automated suites pass.
- Web typecheck/build and connector typecheck/build pass.
- The internal-member and non-member visibility matrix is observed in the
  target environment.
- One existing PR replay and one repository backfill are accepted and visible
  in structured logs without secret leakage.
- No external test data was created and the shared `thread.create` procedure
  remains unchanged.
