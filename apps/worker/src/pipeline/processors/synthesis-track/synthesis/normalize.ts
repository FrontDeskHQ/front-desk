import type { Action, ThreadRead } from "@workspace/schemas/signals";
import {
  inferredGrounding,
  isFinishedStatus,
  isIssueAction,
  sanitizeAgentReadReasoning,
  STATUS_DUPLICATED,
  STATUS_LABELS,
  threadReadSchema,
} from "@workspace/schemas/signals";

import type { SynthesisRawActionSet } from "./synthesize";

const allowedKinds = new Set([
  "reply",
  "mark_duplicate",
  "link_pr",
  "link_issue",
  "create_issue",
  "set_status",
]);

const normalizeAction = (
  action: Action,
  verifiedPrUrls?: Set<string>,
  verifiedIssueUrls?: Set<string>
): Action | null => {
  if (!allowedKinds.has(action.kind)) {
    return null;
  }

  if (action.kind === "reply") {
    const draftMarkdown = action.draftMarkdown.trim();
    if (draftMarkdown.length === 0) {
      return null;
    }
    // Kept: the gate reads it, and a human reviewing a held-back draft sees
    // its citations.
    return {
      draftMarkdown,
      grounding: action.grounding ?? inferredGrounding(),
      kind: "reply",
    };
  }

  if (action.kind === "mark_duplicate") {
    if (!action.targetThreadId.trim()) {
      return null;
    }
    return { kind: "mark_duplicate", targetThreadId: action.targetThreadId };
  }

  if (action.kind === "link_pr") {
    const prUrl = action.prUrl.trim();
    if (prUrl.length === 0) {
      return null;
    }
    // When verified URLs are provided, reject link_pr that bypassed read_pr.
    if (verifiedPrUrls && !verifiedPrUrls.has(prUrl)) {
      return null;
    }
    return { kind: "link_pr", prUrl };
  }

  if (action.kind === "link_issue") {
    const issueUrl = action.issueUrl.trim();
    if (issueUrl.length === 0) {
      return null;
    }
    // When verified URLs are provided, reject link_issue that bypassed
    // read_issue (defense in depth vs synthesize).
    if (verifiedIssueUrls && !verifiedIssueUrls.has(issueUrl)) {
      return null;
    }
    return { issueUrl, kind: "link_issue" };
  }

  if (action.kind === "create_issue") {
    const title = action.title.trim();
    const body = action.body.trim();
    // A title-less or body-less create would file an unactionable issue that
    // cannot be undone; drop it rather than send it upstream.
    if (title.length === 0 || body.length === 0) {
      return null;
    }
    return { body, kind: "create_issue", title };
  }

  if (action.kind === "set_status") {
    if (!(action.status in STATUS_LABELS)) {
      return null;
    }
    // Duplicated is a relational claim about another thread, so it stays
    // exclusive to `mark_duplicate`, which verifies the target first.
    if (action.status === STATUS_DUPLICATED) {
      return null;
    }
    if (!isFinishedStatus(action.status)) {
      // Live statuses are ungated, so a witness on one would be inert; drop it
      // rather than persist a claim nothing ever reads.
      return { kind: "set_status", status: action.status };
    }
    // A finished move keeps its witness even when the class cannot justify the
    // destination: the gate denies it and a human reviews the suggestion, which
    // is more useful with the Agent's reasoning attached than without.
    return {
      kind: "set_status",
      status: action.status,
      ...(action.witness ? { witness: action.witness } : {}),
    };
  }

  return null;
};

const orderPrimaryForExecution = (actions: Action[]): Action[] => {
  const reply = actions.find((action) => action.kind === "reply");
  const nonReply = actions.filter((action) => action.kind !== "reply");
  if (!reply) {
    return actions;
  }
  return [...nonReply, reply];
};

export const normalizeSynthesisRawActionSet = ({
  output,
  messageIds,
  fallbackSourceInputMessageId,
  hasTeamReply,
  verifiedPrUrls,
  verifiedIssueUrls,
}: {
  output: SynthesisRawActionSet;
  messageIds: Set<string>;
  fallbackSourceInputMessageId: string;
  hasTeamReply: boolean;
  /**
   * PR URLs returned by successful `read_pr` calls. When set, any `link_pr`
   * whose URL is not in this set is dropped (defense in depth vs synthesize).
   */
  verifiedPrUrls?: Set<string>;
  /**
   * Issue URLs returned by successful `read_issue` calls. Same trust boundary
   * as `verifiedPrUrls`, applied to `link_issue`.
   */
  verifiedIssueUrls?: Set<string>;
}): ThreadRead | null => {
  // If verified-link filtering would drop a primary link_pr, treat as no action
  // — recommendation (and often the reply draft) assume that link and would be stale.
  if (
    verifiedPrUrls &&
    output.primary.some(
      (action) =>
        action.kind === "link_pr" &&
        !verifiedPrUrls.has((action.prUrl ?? "").trim())
    )
  ) {
    return null;
  }

  // Same for a primary link_issue that bypassed read_issue: dropping just the
  // action would leave a recommendation written around a link that is gone.
  if (
    verifiedIssueUrls &&
    output.primary.some(
      (action) =>
        action.kind === "link_issue" &&
        !verifiedIssueUrls.has((action.issueUrl ?? "").trim())
    )
  ) {
    return null;
  }

  let primary = output.primary
    .map((action) =>
      normalizeAction(action as Action, verifiedPrUrls, verifiedIssueUrls)
    )
    .filter((action): action is Action => action !== null);

  if (primary.length === 0) {
    return null;
  }

  let alternatives = (output.alternatives ?? [])
    .map((action) =>
      normalizeAction(action as Action, verifiedPrUrls, verifiedIssueUrls)
    )
    .filter((action): action is Action => action !== null);

  // At most one link_pr across the whole action set (design lock, FRO-204): a
  // thread links a single PR. Keep the first — primary takes precedence over
  // alternatives — and drop any further link_pr entries.
  let linkPrSeen = false;
  const dedupeLinkPr = (actions: Action[]): Action[] =>
    actions.filter((action) => {
      if (action.kind !== "link_pr") {
        return true;
      }
      if (linkPrSeen) {
        return false;
      }
      linkPrSeen = true;
      return true;
    });
  primary = dedupeLinkPr(primary);
  alternatives = dedupeLinkPr(alternatives);

  // Reject a primary that bundles create_issue with link_issue (or with a
  // second create) outright rather than trimming it: create_issue already links
  // what it files, so the pairing is incoherent — the recommendation and reply
  // draft were written for a bundle that can never execute, and silently
  // dropping one half would leave both stale. Rejecting at validation is what
  // keeps ADR 0003's executor free of inter-step data flow.
  if (primary.filter(isIssueAction).length > 1) {
    return null;
  }

  // At most one issue action across the whole set — a thread links a single
  // issue. Primary takes precedence; later entries are dropped.
  let issueActionSeen = false;
  const dedupeIssueAction = (actions: Action[]): Action[] =>
    actions.filter((action) => {
      if (!isIssueAction(action)) {
        return true;
      }
      if (issueActionSeen) {
        return false;
      }
      issueActionSeen = true;
      return true;
    });
  primary = dedupeIssueAction(primary);
  alternatives = dedupeIssueAction(alternatives);

  if (!hasTeamReply) {
    alternatives = alternatives.filter((action) => action.kind === "reply");
    const primaryHasNonReply = primary.some(
      (action) => action.kind !== "reply"
    );
    const primaryHasReply = primary.some((action) => action.kind === "reply");
    if (primaryHasNonReply && !primaryHasReply) {
      return null;
    }
    primary = orderPrimaryForExecution(primary);
  }

  const rawActionSet: ThreadRead = {
    alternatives,
    createdAt: new Date().toISOString(),
    primary,
    reasoning: sanitizeAgentReadReasoning(output.reasoning),
    recommendation: output.recommendation.trim(),
    sourceInputMessageId: messageIds.has(output.sourceInputMessageId)
      ? output.sourceInputMessageId
      : fallbackSourceInputMessageId,
    summary: output.summary.trim(),
    urgencyScore: output.urgencyScore,
  };

  return threadReadSchema.parse(rawActionSet);
};
