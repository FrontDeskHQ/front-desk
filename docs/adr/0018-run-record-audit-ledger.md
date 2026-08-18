# 0018 — Persist forensic run records for Agent behavior

**Status:** Accepted  **Date:** 2026-08-18  **References:** [ADR 0005](./0005-synthesis-candidate-persistence.md), [ADR 0006](./0006-trigger-context-channel.md), [ADR 0017](./0017-inbound-only-trigger-causality.md)

## Context

The final `thread.agentRead`, autonomous receipts, activity rows, and worker logs explain the current result only partially. They do not preserve the exact triggers and hints supplied to synthesis, the model/tool exchange, the policy snapshot, gate decisions, or the actions that were filtered before the final read. After a behavior change, the team therefore has to infer why the Agent took a position from state that may already have changed.

The goal is behavioral debugging and improvement: reconstruct what the Agent could see, what it produced, which deterministic policies narrowed it, and what the system executed. This is not a customer-facing activity history or a compliance-grade non-repudiation ledger.

## Decision

Persist a server-owned forensic [run record](../../CONTEXT.md#run-record) for background worker pipeline executions.

- A logical run covers one thread and has one [run attempt](../../CONTEXT.md#run-attempt) per actual worker execution. Queue retries link to the same logical run and create a new attempt.
- Each attempt appends ordered [run events](../../CONTEXT.md#run-event). Events include raw and coalesced triggers, processor and hint results, Agent-visible context snapshots, model requests and responses, tool calls and results, parsed action sets, autonomy policy, filters, gates, execution outcomes, side-effect identifiers when available, and the final read.
- The model boundary is materialized as observed input and output. Hidden chain-of-thought is not required or treated as an audit artifact.
- The database is the durable source of truth. Run, attempt, and event rows are organization-scoped; event payloads are immutable and stored in full when behaviorally useful. Raw embeddings and redundant infrastructure details may be represented by model/version, counts, hashes, and timing.
- Records are stored indefinitely. There is no expiry field or automatic cleanup path in this version. Payloads use stable event types and JSON without per-event schema-version machinery.
- Internal pipeline persistence is best effort and batched. A persistence failure marks the record incomplete when possible and emits operational telemetry; it must never change Agent prompts, processor order, tool calls, action execution, or pipeline success.
- The only v1 read surface is a narrow, read-only developer query used by the existing UI developer tools. “Copy latest agent run data” reads the latest logical run for the current thread, including all attempts and partial evidence, and copies the complete JSON record. The worker has an internal persistence sink to write the ledger, but no developer-facing or customer-facing write operation, client sync, replay, or mutation surface is added.

## Consequences

- Investigators can follow one causal path from queue cause to Agent-visible evidence, model/tool behavior, deterministic policy, and system consequence without relying on log retention or mutable thread state.
- The ledger intentionally contains customer and organization content that was visible to the Agent. It is server-only and organization-scoped; server-only credentials and unrelated storage are outside the Agent-visible context boundary.
- Indefinite full-payload storage creates unbounded data volume and operational cost. This is accepted for v1; any future deletion, archival, encryption, or compliance policy is a separate decision.
- Audit writes can be incomplete during API/database failures or worker crashes. The attempt status and operational metrics make that gap visible, while the pipeline remains behaviorally independent.
- Interactive Agent chat is not included in this first integration. It can adopt the same run/event vocabulary later.
