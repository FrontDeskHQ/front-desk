import { App } from "octokit";
import { z } from "zod";

import { getGitHubConfig } from "../utils";
import type { GitHubPullRequestLike } from "./external-entity";
import type { GitHubIssueLike } from "./external-entity";
import type {
  GitHubIssueOutcomeNode,
  GitHubPullRequestOutcomeNode,
} from "./outcome";

const config = getGitHubConfig();

const githubUserSchema = z.object({ login: z.string().optional() }).nullable();
const githubLabelSchema = z.union([
  z.string(),
  z.object({ name: z.string().optional() }).nullable(),
]);

export const githubIssueLikeSchema = z.object({
  assignees: z.array(githubUserSchema).nullish(),
  body: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  created_at: z.string(),
  html_url: z.string(),
  id: z.number(),
  labels: z.array(githubLabelSchema).nullish(),
  number: z.number(),
  pull_request: z.unknown().optional(),
  state: z.string().nullable().optional(),
  title: z.string(),
  updated_at: z.string(),
  user: githubUserSchema.optional(),
});

export const githubPullRequestLikeSchema = z.object({
  assignees: z.array(githubUserSchema).nullish(),
  base: z.object({ ref: z.string() }),
  body: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  created_at: z.string(),
  draft: z.boolean().nullable().optional(),
  head: z.object({ ref: z.string() }),
  html_url: z.string(),
  id: z.number(),
  labels: z
    .array(z.object({ name: z.string().optional() }).nullable())
    .nullish(),
  merged: z.boolean().nullable().optional(),
  merged_at: z.string().nullable().optional(),
  number: z.number(),
  state: z.string(),
  title: z.string(),
  updated_at: z.string(),
  user: githubUserSchema.optional(),
});

export const issueOutcomeNodeSchema: z.ZodType<GitHubIssueOutcomeNode> = z.lazy(() =>
  z.object({
    body: z.string().nullable(),
    databaseId: z.number().nullable(),
    duplicateOf: issueOutcomeNodeSchema.nullish(),
    number: z.number(),
    repository: z.object({ nameWithOwner: z.string() }),
    state: z.enum(["OPEN", "CLOSED"]),
    stateReason: z
      .enum(["COMPLETED", "NOT_PLANNED", "DUPLICATE", "REOPENED"])
      .nullable(),
    title: z.string(),
    url: z.string(),
  })
);

export const pullRequestOutcomeNodeSchema: z.ZodType<GitHubPullRequestOutcomeNode> =
  z.object({
    body: z.string().nullable(),
    merged: z.boolean(),
    number: z.number(),
    repository: z.object({ nameWithOwner: z.string() }),
    state: z.enum(["OPEN", "CLOSED", "MERGED"]),
    title: z.string(),
    url: z.string(),
  });

export const app = new App({
  appId: config.appId,
  oauth: {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  },
  privateKey: config.privateKey,
  webhooks: { secret: config.webhookSecret },
});

export const getOctokit = async (installationId: number) =>
  await app.getInstallationOctokit(installationId);

export const fetchIssues = async (
  installationId: number,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
) => {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/issues", {
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
      owner,
      per_page: 100,
      repo,
      state,
    });

    return data.filter((issue) => !issue.pull_request);
  } catch (error) {
    console.error(`Error fetching issues:`, error);
    throw error;
  }
};

/** Fetch one authoritative issue for a developer-action replay. */
export const fetchIssue = async (
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssueLike> => {
  const octokit = await getOctokit(installationId);
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/issues/{issue_number}",
    {
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
      issue_number: issueNumber,
      owner,
      repo,
    }
  );
  if (data.pull_request) {
    throw new Error("TARGET_IS_PULL_REQUEST");
  }
  return githubIssueLikeSchema.parse(data);
};

export const createIssue = async (
  installationId: number,
  owner: string,
  repo: string,
  title: string,
  body: string
) => {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request(
      "POST /repos/{owner}/{repo}/issues",
      {
        body,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
        owner,
        repo,
        title,
      }
    );
    return data;
  } catch (error) {
    console.error(`Error creating issue:`, error);
    throw error;
  }
};

export const setIssueState = async (
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number,
  state: "open" | "closed"
) => {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request(
      "PATCH /repos/{owner}/{repo}/issues/{issue_number}",
      {
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
        issue_number: issueNumber,
        owner,
        repo,
        state,
      }
    );
    return data;
  } catch (error) {
    console.error(`Error setting issue state:`, error);
    throw error;
  }
};

/**
 * Post a comment on an issue or pull request. GitHub models PR comments through
 * the issues comments endpoint, so this covers both.
 */
export const addComment = async (
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) => {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        body,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
        issue_number: issueNumber,
        owner,
        repo,
      }
    );
    return data;
  } catch (error) {
    console.error(`Error adding comment:`, error);
    throw error;
  }
};

export const fetchPullRequests = async (
  installationId: number,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
) => {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
      owner,
      per_page: 100,
      repo,
      state,
    });
    return data;
  } catch (error) {
    console.error(`Error fetching pull requests:`, error);
    throw error;
  }
};

/** Fetch one authoritative pull request for a developer-action replay. */
export const fetchPullRequest = async (
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<GitHubPullRequestLike> => {
  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      {
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
        owner,
        pull_number: pullNumber,
        repo,
      }
    );
    return githubPullRequestLikeSchema.parse(data);
  } catch (error) {
    console.error("Error fetching pull request:", error);
    throw error;
  }
};

export const fetchIssueOutcome = async (
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssueOutcomeNode> => {
  const octokit = await getOctokit(installationId);
  const raw = await octokit.graphql(
    `query ReadIssueOutcome($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          body
          databaseId
          number
          state
          stateReason
          title
          url
          repository { nameWithOwner }
          duplicateOf {
            body
            databaseId
            number
            state
            stateReason
            title
            url
            repository { nameWithOwner }
          }
        }
      }
    }`,
    { number: issueNumber, owner, repo }
  );
  const result = z
    .object({
      repository: z.object({ issue: issueOutcomeNodeSchema.nullable() }),
    })
    .parse(raw);
  if (!result.repository.issue) {
    throw new Error("ISSUE_NOT_FOUND");
  }
  return result.repository.issue;
};

export const fetchPullRequestOutcome = async (
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<GitHubPullRequestOutcomeNode> => {
  const octokit = await getOctokit(installationId);
  const raw = await octokit.graphql(
    `query ReadPullRequestOutcome($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          body
          merged
          number
          state
          title
          url
          repository { nameWithOwner }
        }
      }
    }`,
    { number: pullNumber, owner, repo }
  );
  const result = z
    .object({
      repository: z.object({
        pullRequest: pullRequestOutcomeNodeSchema.nullable(),
      }),
    })
    .parse(raw);
  if (!result.repository.pullRequest) {
    throw new Error("PULL_REQUEST_NOT_FOUND");
  }
  return result.repository.pullRequest;
};
