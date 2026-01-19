import {
  type ExternalIssue,
  type ExternalPullRequest,
  formatGitHubId,
} from "@workspace/schemas/external-issue";
import { ulid } from "ulid";
import z from "zod";
import { createReadThroughCache } from "../../lib/cache/read-through.js";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const GITHUB_SERVER_URL =
  process.env.BASE_GITHUB_SERVER_URL || "http://localhost:3334";
const SUGGESTION_TYPE_RELATED_THREADS = "related_threads";

type SimilarThreadResult = {
  threadId: string;
  score: number;
};

type FetchIssuesInput = {
  organizationId: string;
  state: string;
  repos: Array<{ owner: string; name: string; fullName: string }>;
  installationId: number;
};

type FetchPRsInput = {
  organizationId: string;
  state: string;
  repos: Array<{ owner: string; name: string; fullName: string }>;
  installationId: number;
};

// Helper function to fetch issues from GitHub
const fetchIssuesFromGitHub = async (
  input: FetchIssuesInput
): Promise<{ issues: ExternalIssue[]; count: number }> => {
  const allIssues: ExternalIssue[] = [];

  const results = await Promise.allSettled(
    input.repos.map(async (repo) => {
      const url = new URL("/api/issues", GITHUB_SERVER_URL);
      url.searchParams.set("installation_id", input.installationId.toString());
      url.searchParams.set("owner", repo.owner);
      url.searchParams.set("repo", repo.name);
      url.searchParams.set("state", input.state);

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(
          `Failed to fetch issues for ${repo.fullName}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        issues: Array<{
          id: number;
          number: number;
          title: string;
          body: string;
          state: string;
          html_url: string;
        }>;
      };

      return data.issues.map((issue) => ({
        id: formatGitHubId(issue.id, repo.owner, repo.name),
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        url: issue.html_url,
        repository: {
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName,
        },
      }));
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allIssues.push(...result.value);
    } else {
      console.error(`Error fetching issues:`, result.reason);
    }
  }

  return { issues: allIssues, count: allIssues.length };
};

// Helper function to fetch pull requests from GitHub
const fetchPRsFromGitHub = async (
  input: FetchPRsInput
): Promise<{ pullRequests: ExternalPullRequest[]; count: number }> => {
  const allPullRequests: ExternalPullRequest[] = [];

  const results = await Promise.allSettled(
    input.repos.map(async (repo) => {
      const url = new URL("/api/pull-requests", GITHUB_SERVER_URL);
      url.searchParams.set("installation_id", input.installationId.toString());
      url.searchParams.set("owner", repo.owner);
      url.searchParams.set("repo", repo.name);
      url.searchParams.set("state", input.state);

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(
          `Failed to fetch pull requests for ${repo.fullName}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        pullRequests: Array<{
          id: number;
          number: number;
          title: string;
          body: string;
          state: string;
          html_url: string;
        }>;
      };

      return data.pullRequests.map((pr) => ({
        id: formatGitHubId(pr.id, repo.owner, repo.name),
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        url: pr.html_url,
        repository: {
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName,
        },
      }));
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allPullRequests.push(...result.value);
    } else {
      console.error(`Error fetching pull requests:`, result.reason);
    }
  }

  return {
    pullRequests: allPullRequests,
    count: allPullRequests.length,
  };
};

// Create cache instances for issues and PRs
// Cache for 5 minutes with 1 minute stale-while-revalidate window
const issuesCache = createReadThroughCache<
  FetchIssuesInput,
  { issues: ExternalIssue[]; count: number }
>({
  namespace: "github-issues",
  fetch: fetchIssuesFromGitHub,
  ttl: 300000, // 5 minutes
  swr: 30000, // 30 seconds stale-while-revalidate
  keyGenerator: (input) =>
    `${input.organizationId}:${input.state}:${JSON.stringify(
      input.repos.map((r) => r.fullName).sort()
    )}:${input.installationId}`,
});

const pullRequestsCache = createReadThroughCache<
  FetchPRsInput,
  { pullRequests: ExternalPullRequest[]; count: number }
>({
  namespace: "github-pull-requests",
  fetch: fetchPRsFromGitHub,
  ttl: 300000, // 5 minutes
  swr: 30000, // 30 seconds stale-while-revalidate
  keyGenerator: (input) =>
    `${input.organizationId}:${input.state}:${JSON.stringify(
      input.repos.map((r) => r.fullName).sort()
    )}:${input.installationId}`,
});

const parseSimilarThreadResults = (
  resultsStr: string | null | undefined
): SimilarThreadResult[] => {
  if (!resultsStr) return [];

  try {
    return JSON.parse(resultsStr) as SimilarThreadResult[];
  } catch {
    return [];
  }
};

export default publicRoute
  .collectionRoute(schema.thread, {
    read: () => true,
    insert: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session && !ctx?.portalSession?.session) return false;

      return {
        organization: {
          organizationUsers: {
            userId: ctx.session?.userId ?? ctx.portalSession?.session.userId,
            enabled: true,
          },
        },
      };
    },
    update: {
      preMutation: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
        if (!ctx?.session) return false;

        return {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          },
        };
      },
      postMutation: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
        if (!ctx?.session) return false;

        return {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          },
        };
      },
    },
  })
  .withMutations(({ mutation }) => ({
    create: mutation(
      z.object({
        organizationId: z.string().optional(),
        title: z.string().min(3),
        message: z.union([z.string(), z.any()]), // Accept string or TipTap JSONContent
        author: z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .optional(), // Optional - can be inferred from session
        userId: z.string().optional(), // For portal sessions
        userName: z.string().optional(), // For portal sessions
      })
    ).handler(async ({ req, db }) => {
      // Support internal API key, public API key, or portal session
      if (
        !req.context?.internalApiKey &&
        !req.context?.publicApiKey &&
        !req.context?.portalSession?.session
      ) {
        throw new Error("UNAUTHORIZED");
      }

      // Determine organization ID
      const organizationId =
        req.context?.publicApiKey?.ownerId ?? req.input.organizationId;

      if (!organizationId) {
        throw new Error("MISSING_ORGANIZATION_ID");
      }

      // For portal sessions, verify the user matches
      if (req.context?.portalSession?.session) {
        const sessionUserId = req.context.portalSession.session.userId;
        if (req.input.userId && req.input.userId !== sessionUserId) {
          throw new Error("UNAUTHORIZED");
        }
      }

      // Convert string message to TipTap format if needed
      const content =
        typeof req.input.message === "string"
          ? JSON.stringify([
              {
                type: "paragraph",
                content: [{ type: "text", text: req.input.message }],
              },
            ])
          : JSON.stringify(req.input.message);

      const threadId = ulid().toLowerCase();

      await db.transaction(async ({ trx }) => {
        let authorId: string;

        // Determine author based on context
        if (req.input.userId || req.context?.portalSession?.session) {
          // Portal session flow - use userId
          const userId =
            req.input.userId ?? req.context?.portalSession?.session.userId;
          const userName =
            req.input.userName ??
            req.context?.portalSession?.session.userName ??
            "Unknown User";

          const existingAuthor = Object.values(
            await trx.find(schema.author, {
              where: {
                userId: userId,
                organizationId: organizationId,
              },
            })
          );

          authorId = existingAuthor[0]?.id;

          if (!authorId) {
            authorId = ulid().toLowerCase();
            await trx.insert(schema.author, {
              id: authorId,
              userId: userId,
              metaId: null,
              name: userName,
              organizationId: organizationId,
            });
          }
        } else if (req.input.author) {
          // API key flow - use metaId
          const existingAuthor = Object.values(
            await trx.find(schema.author, {
              where: {
                metaId: req.input.author.id,
                organizationId: organizationId,
              },
            })
          );

          authorId = existingAuthor[0]?.id;

          if (!authorId) {
            authorId = ulid().toLowerCase();
            await trx.insert(schema.author, {
              id: authorId,
              name: req.input.author.name,
              organizationId: organizationId,
              metaId: req.input.author.id,
              userId: null,
            });
          }
        } else {
          throw new Error("MISSING_AUTHOR_INFO");
        }

        // Create thread
        await trx.insert(schema.thread, {
          id: threadId,
          name: req.input.title,
          organizationId: organizationId,
          authorId: authorId,
          status: 0,
          priority: 0,
          assignedUserId: null,
          createdAt: new Date(),
          deletedAt: null,
          discordChannelId: null,
          externalIssueId: null,
          externalPrId: null,
          externalId: null,
          externalOrigin: null,
          externalMetadataStr: null,
        });

        // Create first message
        await trx.insert(schema.message, {
          id: ulid().toLowerCase(),
          authorId: authorId,
          content: content,
          threadId: threadId,
          createdAt: new Date(),
          origin: null,
          externalMessageId: null,
        });
      });

      const thread = Object.values(
        await db.find(schema.thread, {
          where: { id: threadId },
          include: {
            author: true,
            messages: {
              author: true,
            },
          },
        })
      )[0];

      return thread;
    }),
    fetchRelatedThreads: mutation(
      z.object({
        threadId: z.string(),
        organizationId: z.string(),
      })
    ).handler(async ({ req, db }) => {
      const { threadId, organizationId } = req.input;

      const thread = await db.findOne(schema.thread, threadId);
      if (!thread || thread.organizationId !== organizationId) {
        throw new Error("THREAD_NOT_FOUND");
      }

      const suggestion = Object.values(
        await db.find(schema.suggestion, {
          where: {
            type: SUGGESTION_TYPE_RELATED_THREADS,
            entityId: threadId,
            organizationId,
          },
        })
      )[0];

      const results = parseSimilarThreadResults(suggestion?.resultsStr);
      if (results.length === 0) {
        return [];
      }

      const resultThreadIds = results.map((result) => result.threadId);
      const relatedThreads = Object.values(
        await db.find(schema.thread, {
          where: {
            id: { $in: resultThreadIds },
            organizationId,
          },
          include: {
            author: { user: true },
          },
        })
      );

      const threadById = new Map(
        relatedThreads.map((relatedThread) => [relatedThread.id, relatedThread])
      );
      const orderedThreads = resultThreadIds
        .map((id) => threadById.get(id))
        .filter(
          (
            relatedThread
          ): relatedThread is (typeof relatedThreads)[number] =>
            !!relatedThread && !relatedThread.deletedAt
        );

      return orderedThreads;
    }),
    fetchGithubIssues: mutation(
      z.object({
        organizationId: z.string(),
        state: z.enum(["open", "closed", "all"]).optional().default("open"),
      })
    ).handler(async ({ req, db }) => {
      const organizationId = req.input.organizationId;

      if (!organizationId) {
        throw new Error("MISSING_ORGANIZATION_ID");
      }

      // Verify user has access to the organization
      let authorized = !!req.context?.internalApiKey;

      if (!authorized && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId,
              userId: req.context.session.userId,
              enabled: true,
            },
          })
        )[0];

        authorized = !!selfOrgUser;
      }

      if (!authorized) {
        throw new Error("UNAUTHORIZED");
      }

      // Get GitHub integration config
      const integration = Object.values(
        await db.find(schema.integration, {
          where: {
            organizationId,
            type: "github",
            enabled: true,
          },
        })
      )[0];

      if (!integration || !integration.configStr) {
        throw new Error("GITHUB_INTEGRATION_NOT_CONFIGURED");
      }

      const config = JSON.parse(integration.configStr);
      const { repos, installationId } = config;

      if (!repos || repos.length === 0) {
        throw new Error("GITHUB_REPOSITORIES_NOT_CONFIGURED");
      }

      if (!installationId) {
        throw new Error("GITHUB_INSTALLATION_NOT_CONFIGURED");
      }

      const result = await issuesCache.get({
        organizationId,
        state: req.input.state,
        repos,
        installationId,
      });

      return result;
    }),
    fetchGithubPullRequests: mutation(
      z.object({
        organizationId: z.string(),
        state: z.enum(["open", "closed", "all"]).optional().default("open"),
      })
    ).handler(async ({ req, db }) => {
      const organizationId = req.input.organizationId;

      if (!organizationId) {
        throw new Error("MISSING_ORGANIZATION_ID");
      }

      let authorized = !!req.context?.internalApiKey;

      if (!authorized && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId,
              userId: req.context.session.userId,
              enabled: true,
            },
          })
        )[0];

        authorized = !!selfOrgUser;
      }

      if (!authorized) {
        throw new Error("UNAUTHORIZED");
      }

      const integration = Object.values(
        await db.find(schema.integration, {
          where: {
            organizationId,
            type: "github",
            enabled: true,
          },
        })
      )[0];

      if (!integration || !integration.configStr) {
        throw new Error("GITHUB_INTEGRATION_NOT_CONFIGURED");
      }

      const config = JSON.parse(integration.configStr);
      const { repos, installationId } = config;

      if (!repos || repos.length === 0) {
        throw new Error("GITHUB_REPOSITORIES_NOT_CONFIGURED");
      }

      if (!installationId) {
        throw new Error("GITHUB_INSTALLATION_NOT_CONFIGURED");
      }

      const result = await pullRequestsCache.get({
        organizationId,
        state: req.input.state,
        repos,
        installationId,
      });

      return result;
    }),
    createGithubIssue: mutation(
      z.object({
        organizationId: z.string(),
        threadId: z.string(),
        title: z.string(),
        body: z.string().optional(),
        owner: z.string(),
        repo: z.string(),
      })
    ).handler(async ({ req, db }) => {
      const organizationId = req.input.organizationId;

      if (!organizationId) {
        throw new Error("MISSING_ORGANIZATION_ID");
      }

      let authorized = !!req.context?.internalApiKey;

      if (!authorized && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId,
              userId: req.context.session.userId,
              enabled: true,
            },
          })
        )[0];

        authorized = !!selfOrgUser;
      }

      if (!authorized) {
        throw new Error("UNAUTHORIZED");
      }

      // Get GitHub integration config
      const integration = Object.values(
        await db.find(schema.integration, {
          where: {
            organizationId,
            type: "github",
            enabled: true,
          },
          include: {
            organization: true,
          },
        })
      )[0] as any; // TODO: Remove type assertion when live-state supports includes properly

      if (!integration || !integration.configStr) {
        throw new Error("GITHUB_INTEGRATION_NOT_CONFIGURED");
      }

      const config = JSON.parse(integration.configStr);
      const { repos, installationId } = config;

      if (!repos || repos.length === 0) {
        throw new Error("GITHUB_REPOSITORIES_NOT_CONFIGURED");
      }

      if (!installationId) {
        throw new Error("GITHUB_INSTALLATION_NOT_CONFIGURED");
      }

      // Verify the repository is in the connected repos
      const targetRepo = repos.find(
        (r: { owner: string; name: string }) =>
          r.owner === req.input.owner && r.name === req.input.repo
      );

      if (!targetRepo) {
        throw new Error("GITHUB_REPOSITORY_NOT_CONNECTED");
      }

      // Verify thread exists and belongs to the organization
      const thread = await db.findOne(schema.thread, req.input.threadId);
      if (!thread || thread.organizationId !== organizationId) {
        throw new Error("THREAD_NOT_FOUND");
      }

      // Append FrontDesk footer to issue body
      const orgSlug = integration.organization.slug;
      const threadPortalUrl = `https://${orgSlug}.tryfrontdesk.app/threads/${thread.id}`;
      const footer = `\n\n---\n\nIssue created using FrontDesk. [Click to view thread](${threadPortalUrl}).`;
      const body = (req.input.body ?? "") + footer;

      const response = await fetch(`${GITHUB_SERVER_URL}/api/issues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          installation_id: installationId.toString(),
          owner: req.input.owner,
          repo: req.input.repo,
          title: req.input.title,
          body: body,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Failed to create GitHub issue:", error);
        throw new Error("GITHUB_ISSUE_CREATION_FAILED");
      }

      const data = (await response.json()) as {
        issue: {
          id: number;
          number: number;
          title: string;
          body: string;
          state: string;
          html_url: string;
        };
      };

      await db.insert(schema.update, {
        id: ulid().toLowerCase(),
        threadId: req.input.threadId,
        userId: req.context?.session?.userId ?? null,
        type: "github_issue_created",
        createdAt: new Date(),
        metadataStr: JSON.stringify({
          issueId: data.issue.id,
          issueNumber: data.issue.number,
          issueLabel: `${req.input.owner}/${req.input.repo}#${data.issue.number}`,
        }),
        replicatedStr: null,
      });

      // Invalidate issues cache for "open" state since new issues are always open
      await issuesCache.invalidate({
        organizationId,
        state: "open",
        repos,
        installationId,
      });

      // Also invalidate "all" state cache
      await issuesCache.invalidate({
        organizationId,
        state: "all",
        repos,
        installationId,
      });

      return {
        issue: {
          id: formatGitHubId(data.issue.id, req.input.owner, req.input.repo),
          number: data.issue.number,
          title: data.issue.title,
          body: data.issue.body,
          state: data.issue.state,
          url: data.issue.html_url,
          repository: {
            owner: req.input.owner,
            name: req.input.repo,
            fullName: targetRepo.fullName,
          },
        },
      };
    }),
  }));
