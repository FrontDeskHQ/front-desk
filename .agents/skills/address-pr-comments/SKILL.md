---
name: address-pr-comments
description: Address unresolved PR review comments by reading every thread, implementing justified fixes, judging over-fixing and practicality, replying to and resolving handled or won't-fix comments, and reporting decisions that need human input. Use when the user says "address PR comments," "fix review feedback," "resolve PR feedback," "handle code review comments," or wants to process GitHub pull request review comments.
---

# Address PR Review Comments

Process unresolved PR review comments in explicit rounds. Make only justified changes, avoid over-fixing, close every comment that was handled, and surface decisions that need the user's judgment.

## Operating contract

A **round** is one complete pass over a fresh snapshot of unresolved review threads:

1. Fetch the unresolved threads.
2. Put every thread into exactly one outcome category.
3. Implement and validate justified fixes.
4. Commit and push code changes.
5. Reply to and resolve every handled thread.
6. Verify the GitHub state.
7. Write the round report.

Use these three outcome categories:

- **Acted** — implemented the requested change, or confirmed that the request is already satisfied without a code change.
- **Needs Human Input** — a human must choose between materially different options or accept a meaningful product, architectural, operational, security, or scope trade-off.
- **Not Fixable** — the comment is stale, targets code that no longer exists, cannot be addressed as written, or is deliberately **Won't Fix** because the practical cost is disproportionate to the evidenced risk.

Both **Acted** and **Not Fixable** are handled outcomes: reply with the result or reasoning, then resolve the thread. Keep **Needs Human Input** threads unresolved and untouched until the user decides.

Use `path/to/file.ext:line` as the canonical identifier for every comment in every written output: replies, decision notes, verification records, and report rows. Preserve the original review path and line when code moves; add the current location separately only when useful. For a PR-level comment with no inline location, use `PR-level:0` rather than omitting the identifier.

Always write a round report at the end of every round, even when a category is empty or no code changed. The report must contain exactly three tables—**Acted**, **Needs Human Input**, and **Not Fixable**—and every thread from the round's starting snapshot must appear in exactly one table. Do not start another round until this report is written. If new comments appear after the snapshot, process them in a new round.

**Update active long-project ledgers.** If the user invokes this skill during a **long-project** workflow, or names an active project ledger, reflect PR comments that change scope, operating instructions, acceptance criteria, checklist work, or handoff in that ledger before replying, resolving, or reporting the comment. Record the source comment and status in the ledger's **PR Feedback** section.

## Practicality gate: avoid over-fixing

Treat a review comment as input to judge, not as an automatic requirement. Before implementing a suggestion, assess:

- evidence that the problem exists or is likely in the current system;
- user, data-integrity, security, reliability, and operational impact if it occurs;
- the smallest safe fix that addresses the actual risk;
- new code, infrastructure, dependencies, maintenance, and failure modes introduced by the fix;
- whether the change is reversible and whether it belongs in this PR.

Use the assessment consistently:

- Put a comment in **Acted** when the smallest sufficient fix is proportionate to a demonstrated or material risk.
- Put it in **Not Fixable** with status **Won't Fix — practicality** when the issue is hypothetical or very unlikely, has no material consequence, and fixing it would introduce disproportionate machinery or operational burden.
- Put it in **Needs Human Input** when the consequences are material, the trade-off is genuinely contested, or choosing an approach would commit the project to architecture, product behavior, or ongoing operations.

Prefer the smallest sufficient change. Do not add speculative retries, queues, persistent jobs, new services, or broad abstractions for an unobserved and very unlikely failure unless the risk justifies that machinery. For example, if a failure has never happened, is very unlikely, and preventing it requires a retry queue plus persistent job state, label the comment **Not Fixable — Won't Fix for practicality**, explain the disproportionate complexity, reply, and resolve it. Do not use practicality as a reason to dismiss security, privacy, data loss, compliance, or high-impact reliability risks; fix those risks or send them to **Needs Human Input** when the decision is not yours to make.

## Step 1: Fetch PR comments

First, identify the PR. If not provided, check the current branch:

~~~bash
# Get current branch's PR number
gh pr view --json number,url,title
~~~

Fetch review threads and their resolution status. Prefer thread data so replies are grouped with the original comment:

~~~bash
# Get all review comments (includes resolved status)
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments --jq '.[] | {id: .id, path: .path, line: .line, body: .body, diff_hunk: .diff_hunk}'

# Get unresolved review threads
gh pr view {pr_number} --json reviewThreads --jq '.reviewThreads[] | select(.isResolved == false) | {id: .id, path: .path, line: .line, comments: [.comments[].body]}'
~~~

Take a fresh snapshot at the start of each round. Do not silently omit a thread because its line moved, it has replies, or its code context is inconvenient.

## Step 2: Categorize every thread

Classify every unresolved thread into exactly one category before editing. Use the thread, its diff context, the current code, and the practicality gate.

Record the comment's canonical `file:line` identifier before making a decision. Use that same identifier in the reply and round report, even if the current line number has shifted.

### Acted

Use for:

- code style, naming, imports, type, guard, documentation, test, or logic fixes that are safe and proportionate;
- a request already satisfied by the current code, where a reply can point to the existing behavior;
- a narrowly scoped improvement that directly addresses the reviewer's concern without speculative cleanup.

### Needs Human Input

Use for:

- architectural changes or new infrastructure;
- performance, product, scope, or operational trade-offs;
- security-sensitive decisions where the right policy is not already established;
- questions or ambiguous suggestions with multiple reasonable interpretations;
- conflicting comments that require choosing an approach.

For every row in this category, prepare concrete options and recommend one. Explain the trade-off, what would change, and what decision is needed. Leave the GitHub thread unresolved and do not reply on the user's behalf until the user chooses.

### Not Fixable

Use for:

- deleted or stale code, so the request no longer applies;
- a request that cannot be implemented as written and has no justified equivalent;
- a low-likelihood, low-impact issue where the proposed protection would add disproportionate complexity;
- a deliberate **Won't Fix** decision for practicality after applying the gate.

Record whether the reason is stale code, already gone, cannot reproduce after reasonable investigation with low remaining risk, or **Won't Fix — practicality**. If the issue cannot be reproduced but the potential impact is material, use Needs Human Input instead. A Not Fixable row still requires a reasoned reply and resolution.

If a comment affects the active project ledger, update it even if the code outcome is Acted, Needs Human Input, or Not Fixable. If a comment both requests a safe code change and affects the ledger, do both.

## Step 3: Implement justified changes

For each **Acted** thread that needs code:

1. Read the target file and locate the exact code using the line number and diff context.
2. Make the smallest sufficient change.
3. Avoid unrelated cleanup or speculative hardening.
4. Run the narrowest useful formatter, linter, type check, or test.
5. Record the thread's `file:line` identifier, outcome, and validation result for the report.

If the practicality gate changes the decision while investigating, move the thread to **Not Fixable** or **Needs Human Input** and follow that category's handling rules. Do not implement a large fix merely because a reviewer proposed it.

### Handling line-number drift

If the PR changed since the comment was written, use the **diff_hunk** context to locate the intended code:

~~~bash
# Search for a code pattern from diff_hunk
rg "pattern from diff_hunk" path/to/file.ts
~~~

## Step 4: Commit fixes

Before replying to handled comments, commit any code changes so each implementation has a concrete commit hash to reference. Commit per logical fix, or use one summary commit when the changes are tightly related:

~~~bash
git add -A
git commit -m "address review feedback

- [list of changes made]
"

# Capture the hash that landed the fix
git rev-parse --short HEAD
~~~

Only code changes need a commit. Already-satisfied and Not Fixable outcomes can be replied to without one, but the reply must state that no code change was needed and why.

## Step 5: Push changes

After committing, push to the PR branch so the remote is updated and CI can run on the fixes:

~~~bash
# Push the current branch to its upstream remote
git push -u origin HEAD
~~~

If the push fails because the branch is behind the remote, rebase and push again:

~~~bash
git pull --rebase origin $(git branch --show-current)
git push -u origin HEAD
~~~

Skip pushing only when there were no commits to make. If any fixes were committed, push them before replying to comments.

## Step 6: Reply and resolve handled threads

Handle every **Acted** and **Not Fixable** row. For each one, post a reply first, then resolve the thread. Never resolve a handled thread without a reply.

Use replies that are brief but specific:

- **Implemented:** start with the `file:line` identifier, describe the change, and include the short commit hash, for example: `apps/api/src/profile.ts:42` — fixed in abc1234 by adding the null guard.
- **Already satisfied:** start with the `file:line` identifier, identify the existing behavior or code, and say that no change was needed.
- **Not Fixable:** start with the `file:line` identifier and state the concrete reason. For a practicality decision, say Won't fix for practicality and explain why the likelihood/impact does not justify the proposed complexity.
- **Stale or deleted code:** start with the original `file:line` identifier and say that the target no longer exists and therefore the request cannot be applied.

Do not reply to or resolve **Needs Human Input** threads. Put the options and recommendation in the round report instead.

~~~bash
# Get thread IDs and the first comment ID for replies
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            path
            line
            comments(first: 1) {
              nodes {
                databaseId
                body
              }
            }
          }
        }
      }
    }
  }
' -f owner="{owner}" -f repo="{repo}" -F pr={pr_number}

# Reply to the original comment in the thread
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_database_id}/replies \
  -f body="{reply}"

# Resolve the thread after the reply succeeds
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread {
        isResolved
      }
    }
  }
' -f threadId="{thread_id}"
~~~

Re-fetch unresolved threads after all replies and resolutions. Retry transient API failures. If a reply or resolution still fails, do not claim it was completed; keep the original category, record the failure in the report, and tell the user what remains pending.

## Step 7: Write the round report

Write the report immediately after verification and before ending the round. Use exactly these three tables, include every thread from the starting snapshot exactly once, and write None in an empty table. Every row must identify its comment with the canonical `file:line` form; do not split the location into separate file and line references.

## Round report

### Acted

| Thread | File:line | Outcome | Commit | Reply / resolution |
| --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... |

### Needs Human Input

| Thread | File:line | Decision needed | Options | Recommendation |
| --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... |

### Not Fixable

| Thread | File:line | Status | Reason | Reply / resolution |
| --- | --- | --- | --- | --- |
| ... | ... | ... | ... | ... |

The **Needs Human Input** table must contain actionable options and a recommendation, not just a restatement of the comment. The **Acted** and **Not Fixable** tables must show whether the reply and resolution succeeded. Do not replace any of the three tables with a prose-only summary.

## Error handling

- **Comment references deleted code:** classify as Not Fixable, reply that the code no longer exists, then resolve.
- **Ambiguous suggestion:** classify as Needs Human Input, list the viable options and recommendation, and leave the thread untouched.
- **Conflicting comments:** classify the affected threads as Needs Human Input and explain the conflict and recommendation.
- **Over-fix request:** apply the practicality gate. If the risk is hypothetical/very unlikely and the fix adds disproportionate machinery, classify as Not Fixable with **Won't Fix — practicality**, explain it, reply, and resolve. If the consequences are material, ask for human input instead.
- **Validation failure:** do not reply that an implementation is complete until the change passes the relevant checks. Fix it, recategorize it, or report the unresolved decision.
- **Push failure:** rebase and retry as in Step 5; do not reply as if the remote contains the fix until the push succeeds.
- **Reply or resolve failure:** retry, verify the thread state, and report the exact pending operation if it remains unresolved.
