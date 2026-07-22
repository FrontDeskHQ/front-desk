import { App } from "octokit";

import { getGitHubConfig } from "../utils";

const config = getGitHubConfig();

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
