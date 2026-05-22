# Issue tracker: Linear

Issues and PRDs for this repo live in Linear. Skills interact with Linear through the configured **Linear MCP server** — use those tools, not a shell CLI.

## Defaults

- **Team**: `FRO`
- Unless the user specifies otherwise, create issues in team `FRO`.

## Conventions

Use the Linear MCP tools (names vary by server, but the common operations are):

- **Create an issue**: call the MCP tool that creates a Linear issue. Provide `team: FRO`, a clear `title`, and a markdown `description`. Apply triage labels at creation time when known.
- **Read an issue**: fetch the issue by its Linear identifier (e.g. `FRO-123`), including comments and labels.
- **List issues**: query by team `FRO`, optionally filtered by label or state.
- **Comment**: post a comment to the issue by identifier.
- **Apply / remove labels**: update the issue's labels by identifier; see `docs/agents/triage-labels.md` for the canonical label strings.
- **Close**: transition the issue to a Done/Cancelled workflow state. Cancelled is appropriate for `wontfix`.

If a needed Linear MCP tool isn't available in the current session, stop and tell the user — don't fall back to shell CLIs.

## When a skill says "publish to the issue tracker"

Create a Linear issue in team `FRO`.

## When a skill says "fetch the relevant ticket"

Fetch the Linear issue by identifier (`FRO-NNN`), including comments and labels.
