# Project Ledger Contract

A ledger is the live markdown file for a long refactor or improvement project. Default location: `docs/plans/<project-slug>.md`.

## Required Sections

Keep these headings stable so future sessions can scan and update them.

### Goal

State the durable outcome in one or two paragraphs. Update this only when the user changes the actual target.

### Operating Instructions

Project-specific rules the agent must obey. Add or change entries when the user asks, when accepted PR feedback changes the approach, or when a decision invalidates old instructions.

### Current State

Track status, active checkpoint, branch or PR, and last updated date. This section should make the next session's starting point obvious before reading the full log.

### Checklist

Use durable, reviewable tasks with checkboxes and short ids. Mark an item complete only when its completion criterion is true in the codebase or artifact.

Recommended format:

```markdown
- [ ] LP-001: Short imperative task. Completion: observable result.
```

### Decisions

Record accepted direction changes and why. Prefer short dated bullets. Include reversals instead of deleting old decisions that explain current shape.

### PR Feedback

Track PR comments that affect scope, instructions, acceptance criteria, or checklist work. Include source, status, and the ledger change made.

Recommended statuses:

- `open`
- `applied`
- `needs-human`
- `obsolete`

### Verification Ledger

Record checks run, result, and known gaps. If a check was not run, say why.

### Session Log

Append a concise entry per session with date, work completed, files or areas touched, and unresolved risks.

### Handoff

End with the next exact action. A good handoff lets another agent continue without reconstructing context from chat.

## Update Rules

- Read the ledger before planning or editing.
- Update the ledger before the final response of every implementation session.
- Change instructions when the user or PR feedback changes the project rules.
- Do not check off work that was only started.
- Preserve unresolved blockers and questions until they are resolved.
- Keep entries concise; the ledger should remain useful under context pressure.
