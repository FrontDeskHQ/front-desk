import type { Action, ThreadRead } from "@workspace/schemas/signals";
import {
  isIssueAction,
  sanitizeAgentReadReasoning,
  threadReadSchema,
} from "@workspace/schemas/signals";

import type { SynthesisRawActionSet } from "./synthesize";

const allowedKinds = new Set([
  "reply",
  "mark_duplicate",
  "link_pr",
  "link_issue",
  "create_issue",
  "close",
]);

const normalizeAction = (
  action: Action,
  verifiedPrUrls?: Set<string>
): Action | null => {
  if (!allowedKinds.has(action.kind)) {
    return null;
  }

  if (action.kind === "reply") {
    const draftMarkdown = action.draftMarkdown.trim();
    if (draftMarkdown.length === 0) {
      return null;
    }
    return { draftMarkdown, kind: "reply" };
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

  return { kind: "close" };
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

  let primary = output.primary
    .map((action) => normalizeAction(action as Action, verifiedPrUrls))
    .filter((action): action is Action => action !== null);

  if (primary.length === 0) {
    return null;
  }

  let alternatives = (output.alternatives ?? [])
    .map((action) => normalizeAction(action as Action, verifiedPrUrls))
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
