import { formatGitHubId } from "@workspace/schemas/external-issue";
import { fetchClient } from "./live-state";

/**
 * Shape of an externalEntity mirror row, minus the columns the upsert helper
 * fills in itself (`id`, `organizationId`, `lastSyncedAt`).
 */
export type ExternalEntityFields = {
  provider: string;
  externalKey: string;
  type: "issue" | "pull_request";
  number: number;
  repoFullName: string;
  url: string;
  title: string;
  body: string | null;
  state: string;
  authorLogin: string | null;
  assignees: string[];
  labels: string[];
  externalCreatedAt: Date;
  externalUpdatedAt: Date;
  closedAt: Date | null;
  merged: boolean | null;
  mergedAt: Date | null;
  draft: boolean | null;
  headRef: string | null;
  baseRef: string | null;
};

/**
 * Repository descriptor needed to build an `externalKey`. Webhook payloads carry
 * this on `payload.repository`; the backfill job carries it on the job data.
 */
export type RepoRef = {
  owner: string;
  name: string;
  fullName: string;
};

/**
 * Structural subset of a GitHub issue shared by the webhook payload and the REST
 * list response. Typed loosely so both octokit shapes satisfy it.
 */
export type GitHubIssueLike = {
  id: number;
  number: number;
  html_url: string;
  title: string;
  body?: string | null;
  state?: string | null;
  user?: { login?: string } | null;
  assignees?: ({ login?: string } | null)[] | null;
  labels?: (string | { name?: string } | null)[] | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
};

/**
 * Structural subset of a GitHub pull request shared by the webhook payload and
 * the REST list response. The list endpoint omits the `merged` boolean, so it is
 * derived from `merged_at` when absent.
 */
export type GitHubPullRequestLike = {
  id: number;
  number: number;
  html_url: string;
  title: string;
  body?: string | null;
  state: string;
  user?: { login?: string } | null;
  assignees?: ({ login?: string } | null)[] | null;
  labels?: ({ name?: string } | null)[] | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  merged?: boolean | null;
  merged_at?: string | null;
  draft?: boolean | null;
  head: { ref: string };
  base: { ref: string };
};

/**
 * Map a GitHub issue (webhook payload or REST list item) onto the mirror row
 * fields. Shared by the live webhook handler and the connect-time backfill job
 * so both write identical rows.
 */
export const buildIssueFields = (
  issue: GitHubIssueLike,
  repo: RepoRef
): ExternalEntityFields => ({
  provider: "github",
  externalKey: formatGitHubId(issue.id, repo.owner, repo.name),
  type: "issue",
  number: issue.number,
  repoFullName: repo.fullName,
  url: issue.html_url,
  title: issue.title,
  body: issue.body ?? null,
  state: issue.state ?? "open",
  authorLogin: issue.user?.login ?? null,
  assignees: (issue.assignees ?? [])
    .map((a) => a?.login)
    .filter((login): login is string => Boolean(login)),
  labels: (issue.labels ?? [])
    .map((l) => (typeof l === "string" ? l : l?.name))
    .filter((name): name is string => Boolean(name)),
  externalCreatedAt: new Date(issue.created_at),
  externalUpdatedAt: new Date(issue.updated_at),
  closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
  merged: null,
  mergedAt: null,
  draft: null,
  headRef: null,
  baseRef: null,
});

/**
 * Map a GitHub pull request (webhook payload or REST list item) onto the mirror
 * row fields. `merged` is derived from `merged_at` when the source omits the
 * boolean (the REST list endpoint does).
 */
export const buildPullRequestFields = (
  pr: GitHubPullRequestLike,
  repo: RepoRef
): ExternalEntityFields => ({
  provider: "github",
  externalKey: formatGitHubId(pr.id, repo.owner, repo.name),
  type: "pull_request",
  number: pr.number,
  repoFullName: repo.fullName,
  url: pr.html_url,
  title: pr.title,
  body: pr.body ?? null,
  state: pr.state,
  authorLogin: pr.user?.login ?? null,
  assignees: (pr.assignees ?? [])
    .map((a) => a?.login)
    .filter((login): login is string => Boolean(login)),
  labels: (pr.labels ?? [])
    .map((l) => l?.name)
    .filter((name): name is string => Boolean(name)),
  externalCreatedAt: new Date(pr.created_at),
  externalUpdatedAt: new Date(pr.updated_at),
  closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
  merged: pr.merged ?? pr.merged_at != null,
  mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
  draft: pr.draft ?? false,
  headRef: pr.head.ref,
  baseRef: pr.base.ref,
});

/**
 * Insert or update the org-scoped mirror row for an issue/PR via the custom
 * `externalEntity.upsert` procedure, which owns the
 * `(organizationId, externalKey)` identity and `lastSyncedAt` bookkeeping.
 */
export const upsertExternalEntity = async (
  organizationId: string,
  fields: ExternalEntityFields
) => {
  await fetchClient.mutate.externalEntity.upsert({
    organizationId,
    ...fields,
  });
};
