import type {
  CapabilityEntityRef,
  TrackerReadOutcomeResult,
} from "@connectors/framework";
import { formatGitHubId } from "@workspace/schemas/external-issue";

export interface GitHubIssueOutcomeNode {
  body: string | null;
  databaseId: number | null;
  duplicateOf?: GitHubIssueOutcomeNode | null;
  number: number;
  repository: { nameWithOwner: string };
  state: "OPEN" | "CLOSED";
  stateReason: "COMPLETED" | "NOT_PLANNED" | "DUPLICATE" | "REOPENED" | null;
  title: string;
  url: string;
}

export interface GitHubPullRequestOutcomeNode {
  body: string | null;
  merged: boolean;
  number: number;
  repository: { nameWithOwner: string };
  state: "OPEN" | "CLOSED" | "MERGED";
  title: string;
  url: string;
}

const refForNode = (
  node: Pick<
    GitHubIssueOutcomeNode,
    "databaseId" | "number" | "repository" | "url"
  >
): CapabilityEntityRef | null => {
  if (node.databaseId === null) {
    return null;
  }
  const [owner, repo] = node.repository.nameWithOwner.split("/");
  if (!owner || !repo) {
    return null;
  }
  return {
    externalKey: formatGitHubId(node.databaseId, owner, repo),
    number: node.number,
    repoFullName: node.repository.nameWithOwner,
    url: node.url,
  };
};

const issueOutcome = (
  node: Pick<GitHubIssueOutcomeNode, "state" | "stateReason">
): { finished: boolean; outcome: TrackerReadOutcomeResult["outcome"] } => {
  const finished = node.state === "CLOSED";
  return {
    finished,
    outcome: !finished
      ? "unknown"
      : node.stateReason === "COMPLETED"
        ? "delivered"
        : node.stateReason === "NOT_PLANNED"
          ? "declined"
          : node.stateReason === "DUPLICATE"
            ? "superseded"
            : "unknown",
  };
};

const normalizeIssueNode = (
  node: GitHubIssueOutcomeNode,
  entity: CapabilityEntityRef
): TrackerReadOutcomeResult => {
  const { finished, outcome } = issueOutcome(node);
  const duplicate = node.duplicateOf;
  const successorRef = duplicate ? refForNode(duplicate) : null;
  const successorOutcome = duplicate ? issueOutcome(duplicate) : null;

  return {
    entity,
    finished,
    outcome,
    state: node.state.toLowerCase(),
    successor:
      duplicate && successorRef
        ? {
            entity: successorRef,
            finished: successorOutcome?.finished ?? false,
            outcome: successorOutcome?.outcome ?? "unknown",
            state: duplicate.state.toLowerCase(),
            title: duplicate.title,
            type: "issue",
          }
        : null,
    title: node.title,
    type: "issue",
  };
};

export const normalizeGitHubIssueOutcome = (
  node: GitHubIssueOutcomeNode,
  entity: CapabilityEntityRef
): TrackerReadOutcomeResult => normalizeIssueNode(node, entity);

export const normalizeGitHubPullRequestOutcome = (
  node: GitHubPullRequestOutcomeNode,
  entity: CapabilityEntityRef
): TrackerReadOutcomeResult => ({
  entity,
  finished: node.merged,
  outcome: node.merged ? "delivered" : "unknown",
  state: node.state.toLowerCase(),
  successor: null,
  title: node.title,
  type: "pull_request",
});
