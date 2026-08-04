export interface DeveloperPullRequestCandidate {
  draft: boolean | null | undefined;
  id: string;
  number: number;
  repoFullName: string;
  state: string;
}

export const isEligibleDeveloperPullRequest = ({
  draft,
  state,
}: Pick<DeveloperPullRequestCandidate, "draft" | "state">): boolean =>
  state === "open" && draft !== true;

export const getEligibleDeveloperPullRequests = <
  Candidate extends DeveloperPullRequestCandidate,
>(
  pullRequests: readonly Candidate[]
): Candidate[] =>
  [...pullRequests].filter(isEligibleDeveloperPullRequest).toSorted((a, b) => {
    const repositoryOrder = a.repoFullName.localeCompare(b.repoFullName);
    return repositoryOrder || a.number - b.number;
  });

export const toggleRepositorySelection = (
  selectedRepositories: readonly string[],
  repository: string
): string[] =>
  selectedRepositories.includes(repository)
    ? selectedRepositories.filter((selected) => selected !== repository)
    : [...selectedRepositories, repository];

export const buildRepositoryBackfillPayload = ({
  allRepositories,
  selectedRepositories,
}: {
  allRepositories: boolean;
  selectedRepositories: readonly string[];
}):
  | { allRepositories: true }
  | { allRepositories: false; repositories: string[] } => {
  if (allRepositories) {
    return { allRepositories: true };
  }

  return {
    allRepositories: false,
    repositories: [...new Set(selectedRepositories)].toSorted(),
  };
};
