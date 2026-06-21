---
name: long-project
description: Maintain a long-running refactor or improvement project through a live project ledger.
disable-model-invocation: true
---

# Long Project

Use this skill only when the user invokes it explicitly. The project `ledger` is the source of truth for the work: instructions, checklist state, decisions, verification, PR feedback, session notes, and handoff.

## Start

1. Read [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md).
2. Read [PROJECT_FILE.md](PROJECT_FILE.md).
3. Locate the ledger named by the user, or infer the best `docs/plans/<project-slug>.md` candidate.
4. If no ledger exists, create one from [TEMPLATE.md](TEMPLATE.md) after confirming the project scope.
5. Read the ledger before planning or editing code.

Completion criterion: the active ledger is read, or a new ledger is created with every template prompt replaced.

## Work Rule

During the session, obey the ledger over memory. If the newest user request or PR feedback changes the project, update the ledger's operating instructions, decisions, checklist, or PR feedback before treating the change as settled.

## Handoff Rule

Before the final response of any implementation session, update the ledger. At minimum:

- Mark completed checklist items.
- Record verification run or explain why it was not run.
- Add a session log entry.
- Rewrite the handoff so the next session has one exact next action.

If no planned task was completed, do not check anything off. Record the blocker and next action instead.

Completion criterion: the ledger reflects the work done, remaining work, verification state, and next action.
