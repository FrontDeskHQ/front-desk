# 0017 — Only an inbound message causes a run

**Status:** Temporary — to be reviewed on FRO-222 **Date:** 2026-08-17 **References:** [ADR 0006](./0006-trigger-context-channel.md), [ADR 0013](./0013-grounded-auto-reply.md), [ADR 0015](./0015-witness-gated-thread-finishing.md)

## Context

The `message` [trigger](../../CONTEXT.md#trigger) fired on every row inserted into `message`, with no regard for who wrote it. That is a feedback loop, and it closed in production: a human accepts a thread read whose primary action is a reply, `replyHandler` inserts the drafted message, the `afterInsert` hook enqueues `kind: "message"`, and synthesis runs again over a thread whose newest message the Agent itself composed. It then produces a second read reasoning about that message as evidence — "resolve the thread, the teammate already confirmed the trial and provided the pricing link".

Nothing about that read is wrong on its face. That is what makes the loop dangerous rather than merely noisy: the Agent is grading its own homework and the output looks like judgement. The same loop runs one turn longer under [ADR 0013](./0013-grounded-auto-reply.md)'s autonomous reply, where no human is in the middle at all.

The obvious framing — "the Agent must not trigger the Agent" — does not describe the bug. The accepted reply is authored by *the human who accepted it*; the Agent has no author identity, and we have decided it will not get one. A rule scoped to Agent-authored messages would leave the reported loop entirely intact.

The classification needed to draw the line already existed, in `apps/worker/src/lib/message-roles.ts`, and was already load-bearing for `hasTeamReply` and the reply grounding gate — but only in the worker, read-side, after the trigger had already been enqueued. It also used `agent` to mean *teammate*, colliding with the Agent, and treated `author.userId != null` as proof of teammate-hood, which is false: `portal-auth.ts` runs Better-Auth against the same database with no model overrides, so portal customers and workspace teammates are rows in one `user` table.

## Decision

**A run is caused by the customer's side of the conversation changing.** Only an inbound message enqueues `message`; an outbound one enqueues `supersede`, which clears `thread.agentRead` without invoking synthesis. The existing supersede path already does exactly this and is unchanged.

**Direction is derived from organization membership, not from the request.** Outbound means the author is a member of the thread's organization. Direction is computed from `(author, thread)` at insert time rather than stamped on the row: there are five message insert sites, and a persisted column is a denormalisation that can disagree with the resolver the worker already trusts. The classifier moves out of `apps/worker` into a shared package so the hook and the worker cannot drift, and `MessageRole.agent` is renamed to `teammate`.

Membership was chosen over the two cheaper predicates. `author.userId != null` is what the worker uses today, and it survives only by checking the thread's opener first — the second portal participant in a thread resolves as a teammate, which would both silence the Agent for them and mislabel them in the transcript handed to synthesis. Classifying by authentication flow (workspace session vs. portal session vs. integration key) is free at the call site and needs no read, but it is the same denormalisation sourced from the request instead of the row, and nothing can re-derive it later.

**An unplaceable author is inbound.** A connector-relayed identity has an external id and no membership, so a teammate answering in Discord is indistinguishable from a second customer. Those are counted inbound.

**An autonomous reply sends as the thread's assignee.** With no Agent identity, an unassigned thread has nobody to send as. This is a condition of reply's [action gate](../../CONTEXT.md#action-gate), not of [action availability](../../CONTEXT.md#action-availability): a human accepting the read supplies themselves as sender, so the action stays available and only autonomous execution falls back to `suggest`.

## Consequences

- **The rule is enforced only for replies sent through FrontDesk.** A teammate answering in Discord still triggers a read. Accepted deliberately: the symmetric error — counting unknown authors as outbound — would silence a colleague of the customer adding a stack trace to a thread they did not open, and it would do so invisibly. A redundant read is visible and self-limiting. Mapping connector identities to workspace users would shrink `unknown`, and is not done here.
- **The `abandoned` witness is now unreachable.** Team replies, the read is cleared, and nothing runs again unless the customer writes back — so no run ever exists in which [ADR 0015](./0015-witness-gated-thread-finishing.md)'s `abandoned` → *Closed* can be proposed. The `sla` trigger kind that would cover it is declared in `packages/schemas/src/signals.ts` and emitted by nothing; it was already unreachable in practice, and this ADR makes that structural. A quiet-thread scan is separate work.
- **A teammate replying by hand discards a standing read**, including any `link_pr` or `link_issue` the human had not gotten to. Judged the cheaper error: once the conversation has moved on by hand, the reply half of that read is at best redundant and at worst contradicts what was just sent, and the next inbound message re-derives the rest.
- **A job coalescing both directions still runs.** `supersede` clears, then synthesis runs on the remaining triggers with the outbound message visible in the transcript. A teammate's fast reply must not eat the customer's trigger.
- The worker's transcript author tags are fixed by the same change, since the misclassification in `message-roles.ts` was feeding synthesis directly.
- Recording *that* a message was composed by the Agent — autonomously or via accept — is deliberately not part of this. It no longer gates anything: the accepting human is a member, so the accept path is outbound regardless. Today it is `origin: "agent_read"`, written in one place and read nowhere; giving it a column of its own is a follow-up.
