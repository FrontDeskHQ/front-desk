# 0015 — Finishing a thread is witness-gated, and the upstream sync is one-way

**Status:** Accepted **Date:** 2026-08-10 **References:** [ADR 0013](./0013-grounded-auto-reply.md), [ADR 0014](./0014-status-is-a-synthesis-action.md)

## Context

With [ADR 0014](./0014-status-is-a-synthesis-action.md) putting `set_status` in the synthesis vocabulary, `auto` on it means the Agent can finish a thread unattended. Finishing is not a metadata edit: a thread that becomes _Resolved_ or _Closed_ finishes its linked [external issue](../../CONTEXT.md) upstream, and it ends a conversation the customer may still believe is live.

`set_status` was admitted to `AUTO_CAPABLE_ACTIONS` as "reversible by construction", which was true while status was an internal column and false the moment it crossed that boundary: `compensate` restores our column, not GitHub's.

Two things in the existing code encoded the old assumption. `runSetThreadStatus` treated finished-ness as `status >= STATUS_CLOSED`, an ordinal comparison over an enumeration that is not ordered; and it fired the upstream sync on any boundary crossing in **either** direction, so an Agent moving a thread back to a live status would reopen someone's issue.

## Decision

**A move into a finished state must name a witness.** A new named class — deliberately not "grounding" (a property of a reply's prose, [ADR 0013](./0013-grounded-auto-reply.md)) and not "confidence" (the classifier scalar on `inlineSuggestion`):

- `customer_confirmed` — the customer said so in-thread → _Resolved_
- `entity_settled` — a linked PR merged or a linked issue closed → _Resolved_
- `abandoned` — an `sla` trigger fired with no customer response since the team's last reply → _Closed_
- `inferred` — everything else. Never auto.

Same shape as grounding, different noun, registered in the same per-kind [action gate](../../CONTEXT.md) registry.

**The gate guards the boundary, not the enum.** Moves between live statuses (_Open_, _In progress_) sync nothing, tell the customer nothing, and are trivially reversible, so they auto-execute ungated. Only a move _into_ a finished state is gated.

**Auto-resolving requires a reply in the same bundle that passed its own grounding gate.** Resolving without telling the customer silently ends a conversation they think is live. This is not required for _Closed_: an abandoned thread has nobody left to tell, and a "closing this for inactivity" message is a product decision, not a gate precondition.

**Resolved means no further update is owed.** The test is forward-looking — _will this customer need another update later?_ — not a judgement about how conclusive the last message sounded. This is what makes the upstream sync safe by construction: a thread whose answer was "we're aware, tracked in #412" is not resolved while #412 is open, so the Agent cannot reach the state that would close it. It also gives `state_report` replies their natural pairing, `set_status(In progress)`, where _In progress_ asserts "the loop is open and known" rather than "a teammate is assigned".

**Finished-ness is set membership, not a comparison.** `{Resolved, Closed}` sync upstream; `Duplicated` does not — the customer's need moved to another thread rather than being settled, and the issue still tracks it. The `>=` test is replaced by explicit membership, which also removes a live inconsistency: `runMarkDuplicate` writes _Duplicated_ without syncing while `runSetThreadStatus(Duplicated)` — reachable from the human UI — did sync, so the same destination behaved two ways depending on the verb.

**The sync is one-way: finish only.** Un-finishing a thread never reopens the issue upstream. A customer writing back is not evidence that the engineering work regressed, and GitHub is authoritative for issue state everywhere else in the system. Re-opening a thread is the conservative direction — it puts work back on the team — so it stays ungated.

**Undo is the one exception.** Pressing undo on an autonomous-action receipt _does_ reopen the issue, because that is FrontDesk retracting a write it made, not reacting to new information. The alternative — classifying finishing moves as irreversible and offering no undo — was rejected because it would leave the Agent's most consequential action as the only one a human cannot take back.

## Consequences

- `REVERSIBLE_ACTIONS` can no longer answer for `set_status` as a whole; reversibility now depends on the destination status.
- Witness is a calibration property, like grounding: its failure mode is silent. `customer_confirmed` on a customer who said "thanks, I'll try that" is the adversarial case worth fixtures.
- _Closed_ has one witness class and it is time-based, while _Resolved_ has two that are content-based. Autonomous _Closed_ will therefore be rare, and effectively gated on SLA policy rather than on evidence.
- `setStatusHandler` hardcodes `source: "inline_suggestion"`, which becomes a false provenance under auto; it needs the `autonomous` branch `markDuplicateHandler` already has.
- `mark_duplicate` reaches a finished status without passing this gate, so the witness requirement is bypassable by verb choice. Accepted for now; it does not sync upstream, which bounds the damage.
