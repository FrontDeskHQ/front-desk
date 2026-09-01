import { capabilityEntityRefSchema } from "@connectors/framework";
import { parseExternalId } from "@workspace/schemas/external-issue";
import { z } from "zod";

import {
  buildIssueFields,
  buildPullRequestFields,
  upsertExternalEntity,
} from "./external-entity";
import type {
  GitHubIssueLike,
  GitHubPullRequestLike,
  RepoRef,
} from "./external-entity";
import { enqueuePrMatch, enqueueRepoBackfill } from "./queue";

/** A handled response: an HTTP status plus the JSON body to return. */
export interface GithubDeveloperActionResult {
  body: unknown;
  status: number;
}

export type GithubDeveloperActionHandler = (
  config: string,
  payload: unknown
) => Promise<GithubDeveloperActionResult>;

interface GithubRepo {
  fullName: string;
  name: string;
  owner: string;
}

interface GithubConfig {
  installationId: number;
  repos: GithubRepo[];
}

export interface GithubDeveloperActionDependencies {
  enqueuePrMatch: typeof enqueuePrMatch;
  enqueueRepoBackfill: typeof enqueueRepoBackfill;
  fetchPullRequest: (
    installationId: number,
    owner: string,
    repo: string,
    pullNumber: number
  ) => Promise<GitHubPullRequestLike>;
  fetchIssue: (
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number
  ) => Promise<GitHubIssueLike>;
  upsertExternalEntity: typeof upsertExternalEntity;
}

const githubRepoSchema = z
  .object({
    fullName: z.string().min(1),
    name: z.string().regex(/^[^/]+$/),
    owner: z.string().regex(/^[^/]+$/),
  })
  .refine(({ fullName, name, owner }) => fullName === `${owner}/${name}`, {
    message: "fullName must match owner/name",
  });

const githubConfigSchema = z.object({
  installationId: z.coerce.number().int().positive(),
  repos: z.array(githubRepoSchema).default([]),
});

const prMatchReplayPayloadSchema = z
  .object({
    organizationId: z.string().min(1),
    target: capabilityEntityRefSchema.strict(),
  })
  .strict();

const entityFinishedReplayPayloadSchema = z
  .object({
    organizationId: z.string().min(1),
    target: capabilityEntityRefSchema.strict(),
    type: z.enum(["issue", "pull_request"]),
  })
  .strict();

const repositoryBackfillPayloadSchema = z
  .object({
    allRepositories: z.boolean(),
    organizationId: z.string().min(1),
    repositories: z.array(z.string().min(1)),
  })
  .strict()
  .refine(
    ({ allRepositories, repositories }) =>
      !allRepositories || repositories.length === 0,
    { message: "repositories must be empty when allRepositories is true" }
  );

const result = (
  status: number,
  error: string
): GithubDeveloperActionResult => ({ body: { error }, status });

const parseConfig = (rawConfig: string): GithubConfig | null => {
  try {
    const parsed = githubConfigSchema.safeParse(JSON.parse(rawConfig));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const logAction = (event: Record<string, unknown>): void => {
  console.info(JSON.stringify(event));
};

const logFailure = (event: Record<string, unknown>): void => {
  console.error(JSON.stringify(event));
};

const repoRef = (repo: GithubRepo): RepoRef => repo;

const replayPullRequest = async (
  rawConfig: string,
  rawPayload: unknown,
  dependencies: GithubDeveloperActionDependencies
): Promise<GithubDeveloperActionResult> => {
  const config = parseConfig(rawConfig);
  if (!config) {
    return result(400, "INVALID_CONFIG");
  }

  const parsedPayload = prMatchReplayPayloadSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    return result(400, "INVALID_TARGET");
  }

  const { organizationId, target } = parsedPayload.data;
  const repo = config.repos.find(
    (candidate) => candidate.fullName === target.repoFullName
  );
  if (!repo) {
    return result(400, "REPOSITORY_NOT_CONNECTED");
  }

  const parsedExternalKey = parseExternalId(target.externalKey);
  if (
    !parsedExternalKey ||
    parsedExternalKey.provider !== "github" ||
    parsedExternalKey.owner !== repo.owner ||
    parsedExternalKey.repo !== repo.name
  ) {
    return result(400, "INVALID_TARGET");
  }

  let pullRequest: GitHubPullRequestLike;
  try {
    pullRequest = await dependencies.fetchPullRequest(
      config.installationId,
      repo.owner,
      repo.name,
      target.number
    );
  } catch {
    logFailure({
      action: "pr_match_replay",
      event: "developer_action.execution_failed",
      organizationId,
      target: target.externalKey,
    });
    return result(502, "UPSTREAM_UNAVAILABLE");
  }

  const fields = buildPullRequestFields(pullRequest, repoRef(repo));
  if (fields.externalKey !== target.externalKey || fields.url !== target.url) {
    return result(409, "TARGET_CHANGED");
  }

  try {
    // Refresh the mirror before checking eligibility so closed/draft changes
    // become authoritative without creating any external GitHub data.
    await dependencies.upsertExternalEntity(organizationId, fields);
  } catch {
    logFailure({
      action: "pr_match_replay",
      event: "developer_action.execution_failed",
      organizationId,
      target: target.externalKey,
    });
    return result(500, "ACTION_FAILED");
  }

  if (fields.state !== "open" || fields.draft === true) {
    logAction({
      action: "pr_match_replay",
      event: "developer_action.rejected",
      organizationId,
      reason: "ineligible",
      target: target.externalKey,
    });
    return result(409, "PR_NOT_ELIGIBLE");
  }

  try {
    const jobId = await dependencies.enqueuePrMatch({
      body: fields.body,
      draft: fields.draft,
      externalKey: fields.externalKey,
      headRef: fields.headRef,
      organizationId,
      state: fields.state,
      title: fields.title,
    });

    logAction({
      action: "pr_match_replay",
      event: "developer_action.accepted",
      jobIds: [jobId],
      organizationId,
      target: fields.externalKey,
    });

    return {
      body: { accepted: true, jobIds: [jobId], target: fields.externalKey },
      status: 202,
    };
  } catch {
    logFailure({
      action: "pr_match_replay",
      event: "developer_action.execution_failed",
      organizationId,
      target: target.externalKey,
    });
    return result(500, "ACTION_FAILED");
  }
};

const replayFinishedEntity = async (
  rawConfig: string,
  rawPayload: unknown,
  dependencies: GithubDeveloperActionDependencies
): Promise<GithubDeveloperActionResult> => {
  const config = parseConfig(rawConfig);
  const parsedPayload = entityFinishedReplayPayloadSchema.safeParse(rawPayload);
  if (!config) {
    return result(400, "INVALID_CONFIG");
  }
  if (!parsedPayload.success) {
    return result(400, "INVALID_TARGET");
  }

  const { organizationId, target, type } = parsedPayload.data;
  const repo = config.repos.find(
    (candidate) => candidate.fullName === target.repoFullName
  );
  const parsedExternalKey = parseExternalId(target.externalKey);
  if (
    !repo ||
    !parsedExternalKey ||
    parsedExternalKey.provider !== "github" ||
    parsedExternalKey.owner !== repo.owner ||
    parsedExternalKey.repo !== repo.name
  ) {
    return result(400, repo ? "INVALID_TARGET" : "REPOSITORY_NOT_CONNECTED");
  }

  try {
    const fields =
      type === "issue"
        ? buildIssueFields(
            await dependencies.fetchIssue(
              config.installationId,
              repo.owner,
              repo.name,
              target.number
            ),
            repoRef(repo)
          )
        : buildPullRequestFields(
            await dependencies.fetchPullRequest(
              config.installationId,
              repo.owner,
              repo.name,
              target.number
            ),
            repoRef(repo)
          );

    if (fields.externalKey !== target.externalKey || fields.url !== target.url) {
      return result(409, "TARGET_CHANGED");
    }
    await dependencies.upsertExternalEntity(organizationId, fields);
    const finished =
      fields.type === "issue"
        ? fields.state === "closed"
        : fields.merged === true;
    if (!finished) {
      return result(409, "ENTITY_NOT_FINISHED");
    }
    return {
      body: {
        accepted: true,
        jobIds: [],
        target: fields.externalKey,
      },
      status: 202,
    };
  } catch {
    return result(502, "UPSTREAM_UNAVAILABLE");
  }
};

const backfillRepositories = async (
  rawConfig: string,
  rawPayload: unknown,
  dependencies: GithubDeveloperActionDependencies
): Promise<GithubDeveloperActionResult> => {
  const config = parseConfig(rawConfig);
  if (!config) {
    return result(400, "INVALID_CONFIG");
  }

  const parsedPayload = repositoryBackfillPayloadSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    return result(400, "INVALID_SELECTION");
  }

  const { allRepositories, organizationId, repositories } = parsedPayload.data;
  if (!allRepositories && repositories.length === 0) {
    return result(400, "NO_REPOSITORIES_SELECTED");
  }

  const configuredRepos = new Map(
    config.repos.map((repo) => [repo.fullName, repo])
  );
  const selectedRepos = allRepositories
    ? [...configuredRepos.values()]
    : [...new Set(repositories)].map((fullName) =>
        configuredRepos.get(fullName)
      );

  if (selectedRepos.some((repo) => !repo)) {
    return result(400, "REPOSITORY_NOT_CONNECTED");
  }

  const repos = selectedRepos.filter((repo): repo is GithubRepo =>
    Boolean(repo)
  );
  if (repos.length === 0) {
    return result(400, "NO_REPOSITORIES_CONFIGURED");
  }

  const enqueueResults = await Promise.allSettled(
    repos.map((repo) =>
      dependencies.enqueueRepoBackfill({
        fullName: repo.fullName,
        installationId: config.installationId,
        organizationId,
        owner: repo.owner,
        repo: repo.name,
      })
    )
  );
  const jobIds = enqueueResults.flatMap((enqueueResult) =>
    enqueueResult.status === "fulfilled" ? [enqueueResult.value] : []
  );
  const rejectedCount = enqueueResults.length - jobIds.length;
  const target = allRepositories ? "all" : "selected";

  if (rejectedCount > 0) {
    logFailure({
      action: "repository_backfill",
      event:
        jobIds.length === 0
          ? "developer_action.execution_failed"
          : "developer_action.partial_failure",
      jobIds,
      organizationId,
      rejectedCount,
      target,
    });
    if (jobIds.length === 0) {
      return result(500, "ACTION_FAILED");
    }

    return {
      body: { accepted: true, jobIds, partial: true, target },
      status: 207,
    };
  }

  logAction({
    action: "repository_backfill",
    event: "developer_action.accepted",
    jobIds,
    organizationId,
    target,
  });

  return {
    body: { accepted: true, jobIds, target },
    status: 202,
  };
};

const defaultDependencies: GithubDeveloperActionDependencies = {
  enqueuePrMatch,
  enqueueRepoBackfill,
  fetchIssue: (...args) =>
    import("./github").then(({ fetchIssue }) => fetchIssue(...args)),
  fetchPullRequest: (...args) =>
    import("./github").then(({ fetchPullRequest }) =>
      fetchPullRequest(...args)
    ),
  upsertExternalEntity,
};

/** Build the private GitHub developer-action dispatch map. */
export const createGithubDeveloperActionHandlers = (
  overrides: Partial<GithubDeveloperActionDependencies> = {}
): Readonly<Record<string, GithubDeveloperActionHandler>> => {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    entity_finished_replay: (config, payload) =>
      replayFinishedEntity(config, payload, dependencies),
    pr_match_replay: (config, payload) =>
      replayPullRequest(config, payload, dependencies),
    repository_backfill: (config, payload) =>
      backfillRepositories(config, payload, dependencies),
  };
};
