---
name: address-pr-comments
description: Address unresolved PR review comments by reading all pending comments, identifying AI-actionable suggestions, implementing the changes, and resolving the comments. Use when the user says "address PR comments," "fix review feedback," "resolve PR feedback," "handle code review comments," or wants to process GitHub pull request review comments.
---

# Address PR Review Comments

You are a code review assistant. Your goal is to systematically process unresolved PR comments, implement actionable suggestions, and resolve them.

## Workflow Overview

```
1. Fetch unresolved PR comments
2. Categorize comments (AI-actionable vs needs-human)
3. Implement actionable suggestions
4. Resolve implemented comments
5. Report on remaining items
```

---

## Step 1: Fetch PR Comments

First, identify the PR. If not provided, check current branch:

```bash
# Get current branch's PR number
gh pr view --json number,url,title
```

Then fetch all unresolved review comments:

```bash
# Get all review comments (includes resolved status)
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments --jq '.[] | select(.resolved != true) | {id: .id, path: .path, line: .line, body: .body, diff_hunk: .diff_hunk}'

# Get all review threads with resolution status
gh pr view {pr_number} --json reviewThreads --jq '.reviewThreads[] | select(.isResolved == false) | {id: .id, path: .path, line: .line, comments: [.comments[].body]}'
```

**Alternative using gh pr view:**
```bash
gh pr view {pr_number} --json reviews,comments
```

---

## Step 2: Categorize Comments

For each unresolved comment, determine if it's AI-actionable:

### AI-Actionable (implement these)
- Code style fixes (formatting, naming)
- Add/remove imports
- Add error handling
- Add type annotations
- Fix typos in code or comments
- Rename variables/functions
- Add missing documentation
- Simplify logic as suggested
- Add/modify tests as specified
- Remove dead code
- Add null checks or guards

### Needs Human Decision (flag these)
- Architectural changes
- "Consider if..." suggestions (need decision)
- Performance tradeoffs
- Questions without clear answers
- Alternative approaches to discuss
- Scope changes or feature additions
- Security-sensitive changes

---

## Step 3: Implement Changes

For each AI-actionable comment:

1. **Read the file** at the specified path
2. **Locate the code** using the line number and diff context
3. **Make the change** as suggested
4. **Verify** the change compiles/lints

### Implementation Checklist

```
For each actionable comment:
- [ ] Read the target file
- [ ] Find the exact location (use diff_hunk context if line numbers shifted)
- [ ] Implement the suggested change
- [ ] Run linter on the file
- [ ] Stage the change
```

### Handling Line Number Drift

If the PR has been modified since comments were made, line numbers may have shifted. Use the `diff_hunk` context to locate the correct code:

```bash
# Search for the code pattern from diff_hunk
rg "pattern from diff_hunk" path/to/file.ts
```

---

## Step 4: Resolve Comments

After implementing a change, resolve the comment thread:

```bash
# Get the thread ID for a comment
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
                body
              }
            }
          }
        }
      }
    }
  }
' -f owner="{owner}" -f repo="{repo}" -F pr={pr_number}

# Resolve a thread
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread {
        isResolved
      }
    }
  }
' -f threadId="{thread_id}"
```

---

## Step 5: Create Summary Commit

After addressing all actionable comments, create a commit:

```bash
git add -A
git commit -m "address review feedback

- [list of changes made]
"
```

---

## Step 6: Report Results

Provide a summary to the user:

### Addressed Comments
| File | Line | Change Made |
|------|------|-------------|
| ... | ... | ... |

### Needs Human Decision
| File | Line | Comment | Why |
|------|------|---------|-----|
| ... | ... | ... | Requires architectural decision |

### Could Not Address
| File | Line | Comment | Reason |
|------|------|---------|--------|
| ... | ... | ... | Code no longer exists |

---

## Error Handling

### Comment references deleted code
- Note in summary as "Could Not Address"
- Do not resolve the comment

### Ambiguous suggestion
- If the suggestion could be interpreted multiple ways, flag as "Needs Human Decision"

### Conflicting comments
- If two comments suggest different approaches, flag both as "Needs Human Decision"

### Failed to resolve via API
- Report the error but continue with other comments
- User can manually resolve in GitHub UI

---

## Quick Start Command

To address all PR comments for the current branch:

```bash
# Ensure you're on the PR branch
git branch --show-current

# Fetch latest
git fetch origin

# Get PR info
gh pr view
```

Then follow the workflow above.
