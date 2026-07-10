import {
  CAPABILITY_INVOKE_PATH,
  invokeEnvelopeSchema,
} from "@connectors/framework";
import { formatGitHubId } from "@workspace/schemas/external-issue";
import Elysia from "elysia";
import { z } from "zod";
import { createIssue } from "../lib/github";

/**
 * GitHub's opaque config, interpreted here — the core forwards `configStr`
 * untouched and never parses `installationId`/`repos`.
 */
const githubConfigSchema = z.object({
  installationId: z.coerce.number().int().positive(),
  repos: z.array(
    z.object({
      owner: z.string(),
      name: z.string(),
      fullName: z.string(),
    }),
  ),
});

/** Opaque sub-resource selector for issue-tracker `create`, GitHub-shaped. */
const createIssueTargetSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const createIssuePayloadSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  target: createIssueTargetSchema,
});

/**
 * Standardized capability-invocation endpoint. Dispatches on
 * `{ capability, method }`; currently wraps octokit issue creation behind the
 * `issue-tracker` / `create` contract.
 */
export const capabilitiesRoutes = new Elysia().post(
  CAPABILITY_INVOKE_PATH,
  async ({ body: requestBody, set }) => {
    const envelope = invokeEnvelopeSchema.safeParse(requestBody);
    if (!envelope.success) {
      set.status = 400;
      return {
        error: envelope.error.issues[0]?.message ?? "Invalid invoke envelope",
      };
    }

    const { capability, method, config, payload } = envelope.data;

    if (capability !== "issue-tracker" || method !== "create") {
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

    const parsedPayload = createIssuePayloadSchema.safeParse(payload);
    if (!parsedPayload.success) {
      set.status = 400;
      return {
        error: parsedPayload.error.issues[0]?.message ?? "Invalid payload",
      };
    }

    const { installationId, repos } = parsedConfig.data;
    const { title, body, target } = parsedPayload.data;

    const repo = repos.find(
      (r) => r.owner === target.owner && r.name === target.repo,
    );
    if (!repo) {
      set.status = 400;
      return { error: "REPOSITORY_NOT_CONNECTED" };
    }

    try {
      const issue = await createIssue(
        installationId,
        target.owner,
        target.repo,
        title,
        body,
      );

      set.status = 201;
      return {
        entity: {
          id: formatGitHubId(issue.id, target.owner, target.repo),
          number: issue.number,
          title: issue.title,
          body: issue.body ?? "",
          state: issue.state,
          url: issue.html_url,
          label: `${target.owner}/${target.repo}#${issue.number}`,
        },
      };
    } catch (error) {
      console.error("Error creating issue:", error);
      set.status = 500;
      return { error: "Failed to create issue" };
    }
  },
);
