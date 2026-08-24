# 0013 — Auto-reply is gated on grounding, not capped at `suggest`

**Status:** Accepted **Date:** 2026-08-09

## Context

`AUTO_CAPABLE_ACTIONS` deliberately excluded every customer-facing action, with `reply` capped at `suggest` on the reasoning that free-form generated prose has no structural check on it — unlike `link_pr` (requires a verified `read_pr`), `mark_duplicate` (requires a scored hint), or `create_issue` (requires a default target). That reasoning was right about the problem and wrong about the conclusion: the fix is to give reply a check, not to withhold the action.

## Decision

`reply` becomes auto-capable, gated on **[grounding](../../CONTEXT.md)** — a named class the synthesis agent must emit alongside the draft, where only `documented` and `state_report` may auto-send.

**A class, not a scalar.** A self-reported 0–1 confidence is uncheckable; models emit `0.9` on hallucinations. A class that must name its sources is verifiable against what the run actually retrieved — the same move already made for `link_pr` and `link_issue`. Applicability (does the source answer _this_ question?) is folded into the class definition rather than split into a second field, because a separate `sufficiency` dimension would be collapsed straight back to a boolean by the gate.

**Gated in the autonomy stage, via a generic action-gate registry.** When reply autonomy is `suggest` or `auto`, synthesis emits its best draft; `off` removes reply from the synthesis contract entirely. A low-grounding reply under `auto` still reaches a human as a `suggest` rather than vanishing. The gate is a per-kind entry in a registry so future kinds can register one, but grounding itself stays on `replyActionSchema` — no other kind grows a field it will never use.

**The gate runs after per-kind autonomy partitioning.** A `state_report` reply citing a link established in the same bundle must be able to see whether that sibling is actually executing rather than merely suggested. Without this ordering the Agent could auto-send a customer a reference to work whose linking action still awaits human review.

**Degradation is per-action.** A failed gate downgrades the reply only; reversible siblings still auto-execute, leaving the ADR-0003 partial state ("prefix committed, reply still owed") the UI already handles.

**The Agent may not send two consecutive replies reporting the same state.** The customer speaking and a linked entity changing (a PR merging) both count as the state moving; elapsed time alone does not, since a clock keeps ticking but state transitions are finite.

## Consequences

- Orgs see `Auto` for reply as a normal third option, with an informational panel on selection explaining the restrictions. The stored enum stays three-valued.
- An auto-sent reply is irreversible and its receipt carries no undo. The safety mechanisms are the gate, the consecutive-reply invariant, and `off` by default — not reversal.
- Orgs with no crawled documentation can still enable it; only `state_report` replies will qualify, and the settings panel says so.
- Grounding's honesty is a calibration property, so its failure mode is silent. Adversarial cases (adjacent-but-not-answering docs, plausible ungrounded prose, `state_report` with no linked entity) belong in the existing `synthesis-agent.eval.ts`, which already carries documentation fixtures.
