# 0020 — Finished external entities cause Agent runs, not direct resolution

**Status:** Accepted **Date:** 2026-09-01 **References:** [ADR 0006](./0006-trigger-context-channel.md), [ADR 0015](./0015-witness-gated-thread-finishing.md), [ADR 0017](./0017-inbound-only-trigger-causality.md)

## Context

When a linked external issue closes or a linked pull request merges, the customer is owed an outcome-specific follow-up. Connectors therefore no longer resolve linked threads directly. The core mirror detects a known unfinished-to-finished transition and enqueues one `entity_finished` run for every linked live thread; a human linking an already-finished entity enqueues the same cause for that thread. Initial backfill does not fan out. Causes coalesce per thread and retain one payload per entity.

Closing an external entity is only a structural fact. A closed issue may mean completed, declined, duplicated, or something the provider cannot classify, while a closed-unmerged pull request does not mean delivery. Directly resolving the customer thread loses that distinction and can finish a conversation without telling the customer.

## Decision

Synthesis reads the current outcome through the entity's existing tracker capability. Providers normalize it to `delivered`, `declined`, `superseded`, or `unknown`, with a structured canonical successor for duplicates when available. `entity_finished` is only the external fact. The Agent may claim `entity_settled` after comparing that outcome with the customer conversation. Delivered outcomes may auto-send under the existing reply and status policies. Negative and unknown outcomes remain human-reviewed. Tracker URLs stay internal.

The Agent owns both the reply and resolution. A linked thread remains live until the reply and finishing status actions execute or a human accepts them. The executor persists a closing reply before a finishing status so partial failure leaves the thread live after the customer hears from the team, never resolved without a reply. External reopening does not reopen customer threads, and accepted reads are not revalidated against later entity state in this version.

Transition fan-out uses the existing durable thread-read queue rather than a transactional outbox. A failure before Redis accepts the trigger can lose the automatic run; reconciliation does not recreate a transition, so developer replay is the recovery path. This bounded reliability gap avoids a new claim, retention, and recovery subsystem for a rare failure window.

## Consequences

- Issues closed as completed and merged pull requests can generate one coherent customer reply plus resolution under existing per-action autonomy.
- Declined, duplicate, and ambiguous results are still surfaced, but require human review unless a canonical successor independently produces a delivered outcome.
- Closed-unmerged pull requests do not fan out, and external reopening does not reverse a customer-thread decision.
- The mirror write is not transactionally coupled to Redis. Operators recover the narrow missed-delivery window with the developer replay action.
