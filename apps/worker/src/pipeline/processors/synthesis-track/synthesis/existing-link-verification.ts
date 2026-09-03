import {
  STATUS_CLOSED,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
  STATUS_RESOLVED,
} from "@workspace/schemas/signals";
import type { Action } from "@workspace/schemas/signals";

interface VerifiedLinkDetails {
  externalKey?: string;
}

interface CurrentLinks {
  issueExternalKey?: string | null;
  pullRequestExternalKey?: string | null;
}

const isRedundantLink = <
  T extends { issueUrl?: string; kind: string; prUrl?: string },
>(
  action: T,
  current: CurrentLinks,
  verifiedIssues: ReadonlyMap<string, VerifiedLinkDetails>,
  verifiedPullRequests: ReadonlyMap<string, VerifiedLinkDetails>
): boolean => {
  if (action.kind === "link_issue") {
    const externalKey = verifiedIssues.get(
      action.issueUrl?.trim() ?? ""
    )?.externalKey;
    return Boolean(
      externalKey && externalKey === current.issueExternalKey?.trim()
    );
  }
  if (action.kind === "link_pr") {
    const externalKey = verifiedPullRequests.get(
      action.prUrl?.trim() ?? ""
    )?.externalKey;
    return Boolean(
      externalKey && externalKey === current.pullRequestExternalKey?.trim()
    );
  }
  return false;
};

/** Remove link actions whose provider identity is already attached to the thread. */
export const filterRedundantLinkActions = <
  T extends { issueUrl?: string; kind: string; prUrl?: string },
>(
  primary: T[],
  alternatives: T[],
  current: CurrentLinks,
  verifiedIssues: ReadonlyMap<string, VerifiedLinkDetails>,
  verifiedPullRequests: ReadonlyMap<string, VerifiedLinkDetails>
): { alternatives: T[]; primary: T[]; removedPrimary: boolean } => {
  const filter = (actions: T[]) =>
    actions.filter(
      (action) =>
        !isRedundantLink(action, current, verifiedIssues, verifiedPullRequests)
    );
  const filteredPrimary = filter(primary);
  return {
    alternatives: filter(alternatives),
    primary: filteredPrimary,
    removedPrimary: filteredPrimary.length !== primary.length,
  };
};

/** Keep the inbox headline aligned after defense-in-depth removes a no-op link. */
export const recommendationAfterRedundantLink = (primary: Action[]): string => {
  if (primary.length === 0) {
    return "No substantive move is justified yet.";
  }

  const hasReply = primary.some((action) => action.kind === "reply");
  const status = primary.find(
    (action): action is Extract<Action, { kind: "set_status" }> =>
      action.kind === "set_status"
  )?.status;

  if (hasReply && status === STATUS_RESOLVED) {
    return "Reply with the verified update and resolve the thread.";
  }
  if (hasReply && status === STATUS_CLOSED) {
    return "Reply with the final update and close the thread.";
  }
  if (hasReply && status === STATUS_IN_PROGRESS) {
    return "Reply with the update and mark the thread in progress.";
  }
  if (hasReply && status === STATUS_OPEN) {
    return "Reply to the customer and reopen the thread.";
  }
  if (hasReply) {
    return "Reply to the customer with the verified update.";
  }
  if (status === STATUS_RESOLVED) {
    return "Resolve the thread.";
  }
  if (status === STATUS_CLOSED) {
    return "Close the thread.";
  }
  if (status === STATUS_IN_PROGRESS) {
    return "Mark the thread in progress.";
  }
  if (status === STATUS_OPEN) {
    return "Reopen the thread.";
  }
  return "Review and apply the remaining proposed actions.";
};
