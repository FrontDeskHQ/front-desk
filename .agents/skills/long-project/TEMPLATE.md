# Project Ledger Template

When creating a new ledger, copy this template into `docs/plans/<project-slug>.md` or the path requested by the user. Replace every bracketed prompt before saving the ledger.

```markdown
# Plan: [project name]

## Goal

[State the durable outcome and why it matters.]

## Operating Instructions

- [Project-specific rule the agent must obey.]

## Current State

- Status: [not-started | in-progress | blocked | review | complete]
- Active checkpoint: [checklist id or short description]
- Branch or PR: [branch name, PR URL, or none]
- Last updated: [date]

## Checklist

- [ ] LP-001: [First concrete task.] Completion: [observable result.]

## Decisions

- [date]: [Decision and reason.]

## PR Feedback

- Status: none.

## Verification Ledger

- [date]: Not run yet. Reason: [why verification has not run.]

## Session Log

- [date]: Created ledger. Next focus is [first concrete task].

## Handoff

Next action: [one exact action for the next session.]
```

If any bracketed prompt cannot be filled from context, ask the user instead of writing the new ledger.
