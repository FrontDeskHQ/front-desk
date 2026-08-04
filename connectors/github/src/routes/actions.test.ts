import Elysia from "elysia";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGithubDeveloperActionHandlers } from "../lib/developer-actions";
import type { GithubDeveloperActionDependencies } from "../lib/developer-actions";
import { createDeveloperActionsRoute } from "./actions";
import type { DeveloperActionHandler } from "./actions";

const secret = "connector-secret";

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/actions/invoke", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

const actionHandlers = (
  handler: DeveloperActionHandler
): Readonly<Record<string, DeveloperActionHandler>> => ({
  "test.action": handler,
});

describe("GitHub developer-action route", () => {
  afterEach(() => {
    delete process.env.DISCORD_BOT_KEY;
    vi.restoreAllMocks();
  });

  it("requires the shared connector secret", async () => {
    process.env.DISCORD_BOT_KEY = secret;
    const app = new Elysia().use(
      createDeveloperActionsRoute(
        actionHandlers(vi.fn<DeveloperActionHandler>())
      )
    );

    const response = await app.handle(
      request({ action: "test.action", config: "{}", payload: {} })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toStrictEqual({
      error: "UNAUTHORIZED",
    });
  });

  it("rejects unknown actions without parsing connector configuration", async () => {
    process.env.DISCORD_BOT_KEY = secret;
    const app = new Elysia().use(createDeveloperActionsRoute({}));

    const response = await app.handle(
      request(
        { action: "unknown.action", config: "not-json", payload: {} },
        { "x-connector-secret": secret }
      )
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toStrictEqual({
      error: "UNKNOWN_ACTION",
    });
  });

  it("returns the connector's accepted fire-and-forget result", async () => {
    process.env.DISCORD_BOT_KEY = secret;
    const handler = vi.fn<DeveloperActionHandler>(async () => ({
      body: { accepted: true, jobIds: ["job-1"] },
      status: 202,
    }));
    const app = new Elysia().use(
      createDeveloperActionsRoute(actionHandlers(handler))
    );

    const response = await app.handle(
      request(
        {
          action: "test.action",
          config: '{"installationId":123}',
          payload: { target: "entity-a" },
        },
        { "x-connector-secret": secret }
      )
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toStrictEqual({
      accepted: true,
      jobIds: ["job-1"],
    });
    expect(handler).toHaveBeenCalledExactlyOnceWith('{"installationId":123}', {
      target: "entity-a",
    });
  });

  it("normalizes handler failures", async () => {
    process.env.DISCORD_BOT_KEY = secret;
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const app = new Elysia().use(
      createDeveloperActionsRoute(
        actionHandlers(async () => {
          throw new Error("contains-secret-config");
        })
      )
    );

    const response = await app.handle(
      request(
        { action: "test.action", config: "{}", payload: {} },
        { "x-connector-secret": secret }
      )
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toStrictEqual({
      error: "ACTION_FAILED",
    });
  });
});

const githubConfig = JSON.stringify({
  installationId: 123,
  repos: [
    { fullName: "owner/repo", name: "repo", owner: "owner" },
    { fullName: "owner/other", name: "other", owner: "owner" },
  ],
});

const pullRequest = (overrides: Record<string, unknown> = {}) => ({
  base: { ref: "main" },
  body: "Please fix the issue",
  closed_at: null,
  created_at: "2026-08-03T00:00:00Z",
  draft: false,
  head: { ref: "fix/issue" },
  html_url: "https://github.com/owner/repo/pull/123",
  id: 123,
  labels: [],
  merged: false,
  merged_at: null,
  number: 123,
  state: "open",
  title: "Fix the issue",
  updated_at: "2026-08-04T00:00:00Z",
  user: { login: "contributor" },
  ...overrides,
});

const replayTarget = {
  externalKey: "github:owner/repo#123",
  number: 123,
  repoFullName: "owner/repo",
  url: "https://github.com/owner/repo/pull/123",
};

describe("GitHub developer-action handlers", () => {
  it("refreshes an eligible PR and enqueues the existing match pipeline", async () => {
    const fetchPullRequest = vi
      .fn<GithubDeveloperActionDependencies["fetchPullRequest"]>()
      .mockResolvedValue(pullRequest());
    const upsertExternalEntity = vi
      .fn<GithubDeveloperActionDependencies["upsertExternalEntity"]>()
      .mockResolvedValue(undefined);
    const enqueuePrMatch = vi
      .fn<GithubDeveloperActionDependencies["enqueuePrMatch"]>()
      .mockResolvedValue("pr-match-job");
    const info = vi.spyOn(console, "info").mockReturnValue(undefined);
    const handlers = createGithubDeveloperActionHandlers({
      enqueuePrMatch,
      fetchPullRequest,
      upsertExternalEntity,
    });

    const response = await handlers.pr_match_replay(githubConfig, {
      organizationId: "org-a",
      target: replayTarget,
    });

    expect(response).toStrictEqual({
      body: {
        accepted: true,
        jobIds: ["pr-match-job"],
        target: "github:owner/repo#123",
      },
      status: 202,
    });
    expect(upsertExternalEntity).toHaveBeenCalledWith(
      "org-a",
      expect.objectContaining({
        externalKey: "github:owner/repo#123",
        state: "open",
        type: "pull_request",
      })
    );
    expect(enqueuePrMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        externalKey: "github:owner/repo#123",
        organizationId: "org-a",
      })
    );
    expect(info.mock.calls).toStrictEqual([
      [expect.stringContaining('"event":"developer_action.accepted"')],
    ]);
    const [message] = info.mock.calls[0] ?? [];
    expect(message).not.toContain("installationId");
  });

  it.each([{ draft: true }, { state: "closed" }])(
    "refreshes but rejects an ineligible PR without queueing match side effects (%j)",
    async (overrides) => {
      const fetchPullRequest = vi
        .fn<GithubDeveloperActionDependencies["fetchPullRequest"]>()
        .mockResolvedValue(pullRequest(overrides));
      const upsertExternalEntity = vi
        .fn<GithubDeveloperActionDependencies["upsertExternalEntity"]>()
        .mockResolvedValue(undefined);
      const enqueuePrMatch =
        vi.fn<GithubDeveloperActionDependencies["enqueuePrMatch"]>();
      const info = vi.spyOn(console, "info").mockReturnValue(undefined);
      const handlers = createGithubDeveloperActionHandlers({
        enqueuePrMatch,
        fetchPullRequest,
        upsertExternalEntity,
      });

      const response = await handlers.pr_match_replay(githubConfig, {
        organizationId: "org-a",
        target: replayTarget,
      });

      expect(response).toStrictEqual({
        body: { error: "PR_NOT_ELIGIBLE" },
        status: 409,
      });
      expect(upsertExternalEntity).toHaveBeenCalledOnce();
      expect(enqueuePrMatch).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('"reason":"ineligible"')
      );
    }
  );

  it("coalesces repeated replay requests through the same PR queue key", async () => {
    const enqueuePrMatch = vi
      .fn<GithubDeveloperActionDependencies["enqueuePrMatch"]>()
      .mockResolvedValue("same-pr-match-job");
    const handlers = createGithubDeveloperActionHandlers({
      enqueuePrMatch,
      fetchPullRequest: vi
        .fn<GithubDeveloperActionDependencies["fetchPullRequest"]>()
        .mockResolvedValue(pullRequest()),
      upsertExternalEntity: vi
        .fn<GithubDeveloperActionDependencies["upsertExternalEntity"]>()
        .mockResolvedValue(undefined),
    });
    const payload = { organizationId: "org-a", target: replayTarget };

    await handlers.pr_match_replay(githubConfig, payload);
    await handlers.pr_match_replay(githubConfig, payload);

    expect(enqueuePrMatch).toHaveBeenCalledTimes(2);
    expect(enqueuePrMatch.mock.calls[0]?.[0]).toMatchObject({
      externalKey: "github:owner/repo#123",
      organizationId: "org-a",
    });
    expect(enqueuePrMatch.mock.calls[1]?.[0]).toMatchObject({
      externalKey: "github:owner/repo#123",
      organizationId: "org-a",
    });
  });

  it("rejects a target outside the resolved GitHub installation", async () => {
    const fetchPullRequest =
      vi.fn<GithubDeveloperActionDependencies["fetchPullRequest"]>();
    const handlers = createGithubDeveloperActionHandlers({ fetchPullRequest });

    const response = await handlers.pr_match_replay(githubConfig, {
      organizationId: "org-a",
      target: {
        ...replayTarget,
        repoFullName: "foreign/repo",
      },
    });

    expect(response).toStrictEqual({
      body: { error: "REPOSITORY_NOT_CONNECTED" },
      status: 400,
    });
    expect(fetchPullRequest).not.toHaveBeenCalled();
  });

  it("enqueues selected repositories and the explicit all-repositories choice", async () => {
    const enqueueRepoBackfill = vi
      .fn<GithubDeveloperActionDependencies["enqueueRepoBackfill"]>()
      .mockImplementation(async (data) => `job:${data.fullName}`);
    const handlers = createGithubDeveloperActionHandlers({
      enqueueRepoBackfill,
    });

    const selected = await handlers.repository_backfill(githubConfig, {
      allRepositories: false,
      organizationId: "org-a",
      repositories: ["owner/repo"],
    });
    const all = await handlers.repository_backfill(githubConfig, {
      allRepositories: true,
      organizationId: "org-a",
      repositories: [],
    });

    expect(selected).toStrictEqual({
      body: {
        accepted: true,
        jobIds: ["job:owner/repo"],
        target: "selected",
      },
      status: 202,
    });
    expect(all).toStrictEqual({
      body: {
        accepted: true,
        jobIds: ["job:owner/repo", "job:owner/other"],
        target: "all",
      },
      status: 202,
    });
    expect(enqueueRepoBackfill).toHaveBeenCalledTimes(3);
  });

  it("rejects a contradictory repository selection", async () => {
    const enqueueRepoBackfill =
      vi.fn<GithubDeveloperActionDependencies["enqueueRepoBackfill"]>();
    const handlers = createGithubDeveloperActionHandlers({
      enqueueRepoBackfill,
    });

    const response = await handlers.repository_backfill(githubConfig, {
      allRepositories: true,
      organizationId: "org-a",
      repositories: ["owner/repo"],
    });

    expect(response).toStrictEqual({
      body: { error: "INVALID_SELECTION" },
      status: 400,
    });
    expect(enqueueRepoBackfill).not.toHaveBeenCalled();
  });

  it("distinguishes an empty selection from an unconfigured repository list", async () => {
    const enqueueRepoBackfill =
      vi.fn<GithubDeveloperActionDependencies["enqueueRepoBackfill"]>();
    const handlers = createGithubDeveloperActionHandlers({
      enqueueRepoBackfill,
    });

    const emptySelection = await handlers.repository_backfill(githubConfig, {
      allRepositories: false,
      organizationId: "org-a",
      repositories: [],
    });
    const noConfiguredRepositories = await handlers.repository_backfill(
      JSON.stringify({ installationId: 123, repos: [] }),
      {
        allRepositories: true,
        organizationId: "org-a",
        repositories: [],
      }
    );

    expect(emptySelection).toStrictEqual({
      body: { error: "NO_REPOSITORIES_SELECTED" },
      status: 400,
    });
    expect(noConfiguredRepositories).toStrictEqual({
      body: { error: "NO_REPOSITORIES_CONFIGURED" },
      status: 400,
    });
    expect(enqueueRepoBackfill).not.toHaveBeenCalled();
  });

  it("returns fulfilled job IDs when a backfill is partially accepted", async () => {
    const enqueueRepoBackfill = vi
      .fn<GithubDeveloperActionDependencies["enqueueRepoBackfill"]>()
      .mockImplementation(async (data) => {
        if (data.fullName === "owner/other") {
          throw new Error("queue unavailable");
        }
        return `job:${data.fullName}`;
      });
    const error = vi.spyOn(console, "error").mockReturnValue(undefined);
    const handlers = createGithubDeveloperActionHandlers({
      enqueueRepoBackfill,
    });

    const response = await handlers.repository_backfill(githubConfig, {
      allRepositories: false,
      organizationId: "org-a",
      repositories: ["owner/repo", "owner/other"],
    });

    expect(response).toStrictEqual({
      body: {
        accepted: true,
        jobIds: ["job:owner/repo"],
        partial: true,
        target: "selected",
      },
      status: 207,
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('"event":"developer_action.partial_failure"')
    );
  });

  it("reports a complete backfill enqueue failure as an action failure", async () => {
    const enqueueRepoBackfill = vi
      .fn<GithubDeveloperActionDependencies["enqueueRepoBackfill"]>()
      .mockRejectedValue(new Error("queue unavailable"));
    const error = vi.spyOn(console, "error").mockReturnValue(undefined);
    const handlers = createGithubDeveloperActionHandlers({
      enqueueRepoBackfill,
    });

    const response = await handlers.repository_backfill(githubConfig, {
      allRepositories: false,
      organizationId: "org-a",
      repositories: ["owner/repo"],
    });

    expect(response).toStrictEqual({
      body: { error: "ACTION_FAILED" },
      status: 500,
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('"event":"developer_action.execution_failed"')
    );
  });

  it("rejects foreign repositories without enqueueing any backfill", async () => {
    const enqueueRepoBackfill =
      vi.fn<GithubDeveloperActionDependencies["enqueueRepoBackfill"]>();
    const handlers = createGithubDeveloperActionHandlers({
      enqueueRepoBackfill,
    });

    const response = await handlers.repository_backfill(githubConfig, {
      allRepositories: false,
      organizationId: "org-a",
      repositories: ["foreign/repo"],
    });

    expect(response).toStrictEqual({
      body: { error: "REPOSITORY_NOT_CONNECTED" },
      status: 400,
    });
    expect(enqueueRepoBackfill).not.toHaveBeenCalled();
  });
});
