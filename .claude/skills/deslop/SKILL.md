---
name: deslop
description: Strip AI slop from the current diff without changing behavior.
disable-model-invocation: true
---

# Deslop

**Slop** is code that works and still reads like a machine wrote it: it hedges, it narrates itself, it invents structure nobody asked for, and it defends a past that never shipped. Your job is to strip it from the diff without changing what the code does.

This is a quality pass, not a bug hunt. Behavior stays identical. If you spot a real bug, note it in the report — do not fix it here.

## Scope

Default to the branch diff: `git diff main...HEAD` plus uncommitted changes. If the user names files or a PR, use that instead.

Only touch code inside that scope. Slop elsewhere is somebody else's diff.

## Rules

Apply **every** rule below to **every** changed hunk. A hunk you skimmed is a hunk you did not deslop.

### Prose — names and comments

Names and comments are prose. Orwell's rules govern them:

> Never use a long word where a short one will do. If it is possible to cut a word out, always cut it out. Never use the passive where you can use the active. Never use a jargon word if you can think of an everyday equivalent.

- **Prefer the Saxon word.** `reconcile`, `coalesce`, `normalize`, `orchestrate` sound technical and abstract. `prune`, `run`, `watch`, `drop`, `walk` are short and physical.
- **One word per concept, one concept per word.** If `sync` names "pull remote changes," it cannot also name "flush edits to disk." Rename one.
- **Cut what the context already carries.** In a module named `workspaceWatcher`, `startNativeWorkspaceWatcher` is `watchWorkspace`.
- **A compound name is a hedge.** `lastObservedDiskContent` is a specification to defend; `baseline` is a description to read.
- **Comments state the constraint the code cannot show** — why the non-obvious exists. Keep a comment that explains a non-obvious implementation or a function's side effects. Delete a comment that restates self-evident code, and delete any comment that narrates the change history of this branch.

### Structure

- **Inverted pyramid.** Lead a file with its exported and significant functions; push helpers below. Don't bury the lead.
- **Combine overlapping concepts.** Two types, functions, or constants that mostly overlap should be one. Every distinct concept is something the reader has to hold in their head.
- **Use what exists.** Check `@workspace/utils`, `@workspace/ui`, `@workspace/schemas`, and the app's own modules before writing a helper. An inlined reimplementation of something the repo already has is slop.
- **Delete derivable state.** A value computable from what is already in scope should not be passed or stored. An `isDirty` param that is always `content !== baseline` is a parameter, a type, and a branch you can delete in one move.
- **Abstractions earn their keep.** A wrapper, interface, or option flag with exactly one caller is slop — inline it.

### Overfitting

Code must stand on its own. If a change only makes sense to someone who watched it happen — this conversation, this PR — it is **overfitted**. Write for the reader who arrives with no history.

- A name or comment that needs the conversation to be understood gets rewritten against the codebase's own vocabulary.
- **No back-compat with unshipped code.** An alias, old signature, or migration shim for a shape that only ever existed earlier in this branch is compatibility with something that was never deployed. Delete the old path and update its callers.
- Delete defensive handling for states the code cannot reach.

### Balance

Simplification has a floor. Do not:

- Collapse conditions into nested ternaries or dense one-liners — prefer `if`/`else` or early returns.
- Merge concerns into one function because it saves lines.
- Remove an abstraction that genuinely organizes the code.
- Trade debuggability for brevity.

Explicit beats compact. "Fewer lines" is not the goal; fewer things to understand is.

## Finish

Run `bun run lint` and `bun run typecheck`. Both must pass before you report.

Report a short list of what you cut and why, grouped by file — plus any bug you spotted and deliberately left alone.
