# Session Protocol

Follow this protocol after the user invokes the `long-project` skill.

## 1. Locate The Ledger

Use the path named by the user when present. Otherwise inspect `docs/plans/` for the project most likely referenced by the request.

If several ledgers could match, ask the user to choose. If no ledger exists, confirm the project scope and create a new one from `TEMPLATE.md`.

Completion criterion: exactly one ledger path is selected.

## 2. Read And Reconcile

Read the ledger before planning or editing. Extract:

- Current goal and operating instructions.
- Active checklist item.
- Open blockers or questions.
- PR feedback state.
- Verification expectations.
- Handoff next action.

Then reconcile it with the newest user request and current repository state. If the user request conflicts with the ledger, the newest user request wins and the ledger must be updated.

Completion criterion: the session has a clear active task and no unhandled conflict between user request and ledger.

## 3. Work The Active Task

Keep edits scoped to the active checklist item unless the user expands scope. When work reveals new tasks, add them to the checklist instead of hiding them in the session log.

If instructions change because of user direction or PR feedback, update `Operating Instructions` and add a `Decisions` entry explaining the change.

Completion criterion: code or documentation changes match the active task, or the blocker is understood well enough to hand off.

## 4. Verify

Run the smallest check that proves the completed work when practical. Record every check in `Verification Ledger` with result and known gaps.

If verification cannot run, record the reason and any residual risk.

Completion criterion: verification state is explicit in the ledger.

## 5. Update Handoff

Before the final response, update:

- `Current State`
- `Checklist`
- `Verification Ledger`
- `Session Log`
- `Handoff`

The handoff must contain one exact next action, plus any command or file path the next session needs.

Completion criterion: another agent can resume from the ledger without reading the chat.
