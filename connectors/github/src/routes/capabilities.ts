import {
  CAPABILITY_INVOKE_PATH,
  CAPABILITY_INVOKE_SECRET_HEADER,
  invokeEnvelopeSchema,
  issueTrackerSetStatePayloadSchema,
  prTrackerLinkPayloadSchema,
} from "@connectors/framework";
import { formatGitHubId } from "@workspace/schemas/external-issue";
import Elysia from "elysia";
import { z } from "zod";

import { addComment, createIssue, setIssueState } from "../lib/github";

/**
 * GitHub's opaque config, interpreted here — the core forwards `configStr`
 * untouched and never parses `installationId`/`repos`.
 */
const githubConfigSchema = z.object({
  installationId: z.coerce.number().int().positive(),
  repos: z.array(
    z.object({
      fullName: z.string(),
      name: z.string(),
      owner: z.string(),
    })
  ),
});

type GithubConfig = z.infer<typeof githubConfigSchema>;
type GithubRepo = GithubConfig["repos"][number];

/** Opaque sub-resource selector for issue-tracker `create`, GitHub-shaped. */
const createIssueTargetSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const createIssuePayloadSchema = z.object({
  body: z.string().default(""),
  target: createIssueTargetSchema,
  title: z.string().min(1),
});

// Reuse the framework's exported contracts so the connector can't drift from
// the schemas the core dispatches against.
const setStatePayloadSchema = issueTrackerSetStatePayloadSchema;
const linkPayloadSchema = prTrackerLinkPayloadSchema;

/** A handled response: an HTTP status plus the JSON body to return. */
interface HandlerResult {
  status: number;
  body: unknown;
}

const err = (status: number, error: string): HandlerResult => ({
  body: { error },
  status,
});

/** Resolve a connected repo from its `owner/repo` full name. */
const findRepo = (
  config: GithubConfig,
  repoFullName: string
): GithubRepo | undefined =>
  config.repos.find((r) => r.fullName === repoFullName);

const handleCreateIssue = async (
  config: GithubConfig,
  payload: unknown
): Promise<HandlerResult> => {
  const parsed = createIssuePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return err(400, parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { title, body, target } = parsed.data;
  const repo = config.repos.find(
    (r) => r.owner === target.owner && r.name === target.repo
  );
  if (!repo) {
    return err(400, "REPOSITORY_NOT_CONNECTED");
  }

  try {
    const issue = await createIssue(
      config.installationId,
      target.owner,
      target.repo,
      title,
      body
    );
    return {
      body: {
        entity: {
          body: issue.body ?? "",
          id: formatGitHubId(issue.id, target.owner, target.repo),
          label: `${target.owner}/${target.repo}#${issue.number}`,
          shortId: String(issue.number),
          state: issue.state,
          title: issue.title,
          url: issue.html_url,
        },
      },
      status: 201,
    };
  } catch (error) {
    console.error("Error creating issue:", error);
    return err(500, "Failed to create issue");
  }
};

const handleSetIssueState = async (
  config: GithubConfig,
  payload: unknown
): Promise<HandlerResult> => {
  const parsed = setStatePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return err(400, parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { entity, state } = parsed.data;
  const repo = findRepo(config, entity.repoFullName);
  if (!repo) {
    return err(400, "REPOSITORY_NOT_CONNECTED");
  }

  try {
    await setIssueState(
      config.installationId,
      repo.owner,
      repo.name,
      entity.number,
      state
    );
    return { body: { ok: true }, status: 200 };
  } catch (error) {
    console.error("Error setting issue state:", error);
    return err(500, "Failed to set issue state");
  }
};

const handleLinkPullRequest = async (
  config: GithubConfig,
  payload: unknown
): Promise<HandlerResult> => {
  const parsed = linkPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return err(400, parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { entity, thread } = parsed.data;
  const repo = findRepo(config, entity.repoFullName);
  if (!repo) {
    return err(400, "REPOSITORY_NOT_CONNECTED");
  }

  const body = `Linked to a FrontDesk support thread. [View the conversation](${thread.url}).`;

  try {
    await addComment(
      config.installationId,
      repo.owner,
      repo.name,
      entity.number,
      body
    );
    return { body: { ok: true }, status: 200 };
  } catch (error) {
    console.error("Error linking pull request:", error);
    return err(500, "Failed to link pull request");
  }
};

/** Dispatch table keyed by `capability/method`. */
const handlers: Record<
  string,
  (config: GithubConfig, payload: unknown) => Promise<HandlerResult>
> = {
  "issue-tracker/create": handleCreateIssue,
  "issue-tracker/setState": handleSetIssueState,
  "pr-tracker/link": handleLinkPullRequest,
};

/**
 * Standardized capability-invocation endpoint. Dispatches on
 * `{ capability, method }` to the GitHub-specific handler that fulfils the
 * declared `issue-tracker` / `pr-tracker` contracts behind octokit.
 */
export const capabilitiesRoutes = new Elysia().post(
  CAPABILITY_INVOKE_PATH,
  async ({ body: requestBody, headers, set }) => {
    // Only the core holds the shared secret; reject anyone else who can reach
    // this host. Fails closed when the secret isn't configured.
    const expectedSecret = process.env.DISCORD_BOT_KEY;
    if (
      !expectedSecret ||
      headers[CAPABILITY_INVOKE_SECRET_HEADER] !== expectedSecret
    ) {
      set.status = 401;
      return { error: "UNAUTHORIZED" };
    }

    const envelope = invokeEnvelopeSchema.safeParse(requestBody);
    if (!envelope.success) {
      set.status = 400;
      return {
        error: envelope.error.issues[0]?.message ?? "Invalid invoke envelope",
      };
    }

    const { capability, method, config, payload } = envelope.data;

    const handler = handlers[`${capability}/${method}`];
    if (!handler) {
      set.status = 404;
      return {
        error: `Unsupported capability/method: ${capability}/${method}`,
      };
    }

    if (!config) {
      set.status = 400;
      return { error: "MISSING_CONFIG" };
    }

    let rawConfig: unknown;
    try {
      rawConfig = JSON.parse(config);
    } catch {
      set.status = 400;
      return { error: "INVALID_CONFIG" };
    }

    const parsedConfig = githubConfigSchema.safeParse(rawConfig);
    if (!parsedConfig.success) {
      set.status = 400;
      return { error: "INVALID_CONFIG" };
    }

    const result = await handler(parsedConfig.data, payload);
    set.status = result.status;
    return result.body;
  }
);
