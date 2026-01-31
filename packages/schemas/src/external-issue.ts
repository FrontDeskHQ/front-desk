/**
 * Provider-agnostic types for external issues and pull requests
 * These types are used across different providers (GitHub, GitLab, Linear, etc.)
 */

export type ExternalRepository = {
  owner: string;
  name: string;
  fullName: string;
};

export type ExternalIssue = {
  /** Formatted external ID with provider prefix (e.g., github:owner/repo#123) */
  id: string;
  /** Issue/PR number within the repository */
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  repository: ExternalRepository;
};

export type ExternalPullRequest = {
  /** Formatted external ID with provider prefix (e.g., github:owner/repo#123) */
  id: string;
  /** PR number within the repository */
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  repository: ExternalRepository;
};

/**
 * Formats a GitHub issue/PR ID with provider prefix and repository
 * Format: github:owner/repo#id
 */
export const formatGitHubId = (
  id: number,
  owner: string,
  repo: string
): string => {
  return `github:${owner}/${repo}#${id}`;
};

/**
 * Parses a formatted external ID to extract provider, repository, and ID
 * Returns null if the format is invalid
 */
export const parseExternalId = (
  externalId: string
): {
  provider: string;
  owner: string;
  repo: string;
  id: number;
} | null => {
  // Format: provider:owner/repo#id
  const match = externalId.match(/^([^:]+):([^/]+)\/([^#]+)#(\d+)$/);
  if (!match) {
    return null;
  }

  const provider = match[1] as string;
  const owner = match[2] as string;
  const repo = match[3] as string;
  const idStr = match[4] as string;

  const id = parseInt(idStr, 10);

  if (Number.isNaN(id)) {
    return null;
  }

  return { provider, owner, repo, id };
};

/**
 * Checks if an external ID matches a GitHub issue/PR
 */
export const isGitHubId = (externalId: string): boolean => {
  return externalId.startsWith("github:");
};

/**
 * Extracts the numeric ID from a formatted external ID
 * Returns the original string if it's not in the expected format (for backward compatibility)
 */
export const extractIdFromExternalId = (externalId: string): string => {
  const parsed = parseExternalId(externalId);
  return parsed ? parsed.id.toString() : externalId;
};
