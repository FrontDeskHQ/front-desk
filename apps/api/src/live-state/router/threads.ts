// TODO refactor with new live-state mental model
import { formatGitHubId } from "@workspace/schemas/external-issue";
import { ulid } from "ulid";
import z from "zod";
import { authorize } from "../../lib/authorize";
import {
  archiveThreadInputSchema,
  assignUserInputSchema,
  linkIssueInputSchema,
  linkPullRequestInputSchema,
  markDuplicateInputSchema,
  restoreThreadInputSchema,
  runArchiveThread,
  runAssignThreadUser,
  runLinkIssue,
  runLinkPullRequest,
  runMarkDuplicate,
  runRestoreThread,
  runSetAgentRead,
  runSetThreadPriority,
  runSetThreadStatus,
  runUnlinkIssue,
  runUnlinkPullRequest,
  setAgentReadInputSchema,
  setPriorityInputSchema,
  setStatusInputSchema,
  unlinkIssueInputSchema,
  unlinkPullRequestInputSchema,
} from "../../lib/thread-mutations";
import {
  acceptInlineSuggestionInputSchema,
  acceptReadInputSchema,
  dismissInlineSuggestionInputSchema,
  dismissReadInputSchema,
  executeAutonomousBundleInputSchema,
  runAcceptInlineSuggestion,
  runAcceptRead,
  runDismissInlineSuggestion,
  runDismissRead,
  runExecuteAutonomousBundle,
  runUpsertInlineSuggestion,
  runWriteHintSlot,
  upsertInlineSuggestionInputSchema,
  writeHintSlotInputSchema,
} from "../../lib/signals/thread-procedures.js";
import { serializeMessageContent } from "../../lib/tiptap-content";
import { nextThreadShortId } from "../../lib/thread-short-id";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const integrationAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const integrationFirstMessageSchema = z.object({
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  origin: z.string().nullable().optional(),
  externalMessageId: z.string().nullable().optional(),
  isBackfill: z.boolean().optional(),
});

const threadCreateInputSchema = z.object({
  organizationId: z.string().optional(),
  title: z.string().min(3),
  message: z.union([z.string(), z.any()]),
  author: integrationAuthorSchema.optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  status: z.number().int().min(0).max(4).optional(),
  discordChannelId: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
  externalOrigin: z.string().nullable().optional(),
  externalMetadataStr: z.string().nullable().optional(),
  firstMessage: integrationFirstMessageSchema.optional(),
});

const GITHUB_SERVER_URL =
  process.env.BASE_GITHUB_SERVER_URL || "http://localhost:3334";

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
  .withProcedures(({ mutation, query }) => ({
    create: mutation(threadCreateInputSchema).handler(async ({ req, db }) => {
      const hasInternalKey = !!req.context?.internalApiKey;
      const hasPublicKey = !!req.context?.publicApiKey;
      const hasPortalSession = !!req.context?.portalSession?.session;
      const hasWorkspaceSession = !!req.context?.session?.userId;

      if (
        !hasInternalKey &&
        !hasPublicKey &&
        !hasPortalSession &&
        !hasWorkspaceSession
      ) {
        throw new Error("UNAUTHORIZED");
      }

      // Determine organization ID
      const organizationId =
        req.context?.publicApiKey?.ownerId ?? req.input.organizationId;

      if (!organizationId) {
        throw new Error("MISSING_ORGANIZATION_ID");
      }

      if (
        hasWorkspaceSession &&
        !hasInternalKey &&
        !hasPublicKey &&
        !hasPortalSession
      ) {
        authorize(req, { organizationId });
        if (!req.input.author) {
          throw new Error("MISSING_AUTHOR_INFO");
        }
      }

      // For portal sessions, verify the user matches
      if (req.context?.portalSession?.session) {
        const sessionUserId = req.context.portalSession.session.userId;
        if (req.input.userId && req.input.userId !== sessionUserId) {
          throw new Error("UNAUTHORIZED");
        }
      }

      const content = serializeMessageContent(req.input.message);

      const threadId = req.input.id ?? ulid().toLowerCase();
      const firstMessage = req.input.firstMessage;

      await db.transaction(async ({ trx }) => {
        let authorId: string | undefined;

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
            }),
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
            }),
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

        const shortId = await nextThreadShortId(trx, organizationId);

        // Create thread
        await trx.insert(schema.thread, {
          id: threadId,
          name: req.input.title,
          organizationId: organizationId,
          authorId: authorId,
          status: req.input.status ?? 0,
          priority: 0,
          assignedUserId: null,
          createdAt: req.input.createdAt ?? new Date(),
          deletedAt: null,
          discordChannelId: req.input.discordChannelId ?? null,
          externalIssueId: null,
          externalPrId: null,
          externalId: req.input.externalId ?? null,
          externalOrigin: req.input.externalOrigin ?? null,
          externalMetadataStr: req.input.externalMetadataStr ?? null,
          shortId,
        });

        // Create first message
        await trx.insert(schema.message, {
          id: firstMessage?.id ?? ulid().toLowerCase(),
          authorId: authorId,
          content: content,
          threadId: threadId,
          createdAt: firstMessage?.createdAt ?? new Date(),
          origin: firstMessage?.origin ?? null,
          externalMessageId: firstMessage?.externalMessageId ?? null,
          isBackfill: firstMessage?.isBackfill ?? false,
        });
      });

      const thread = Object.values(
        await db.find(schema.thread, {
          where: { id: threadId },
          include: {
            author: true,
            messages: {
              include: { author: true },
            },
          },
        }),
      )[0];

      return thread;
    }),
    list: query(
      z.object({
        organizationId: z.string(),
        status: z.number().optional(),
        priority: z.number().optional(),
        assignedUserId: z.string().nullable().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
        direction: z.enum(["asc", "desc"]).default("desc"),
      }),
    ).handler(async ({ req, db }) => {
      const {
        organizationId,
        status,
        priority,
        assignedUserId,
        cursor,
        limit,
        direction,
      } = req.input;

      // authorize(req, { organizationId });

      let query = db.thread.where({
        organizationId,
        deletedAt: null,
      });

      if (status !== undefined) {
        query = query.where({ status });
      }
      if (priority !== undefined) {
        query = query.where({ priority });
      }
      if (assignedUserId !== undefined) {
        query = query.where({ assignedUserId });
      }

      if (cursor) {
        const op = direction === "desc" ? "$lt" : "$gt";
        query = query.where({ id: { [op]: cursor } });
      }

      const rows = await query
        .include({
          messages: { include: { author: true } },
          author: true,
          assignedUser: true,
          labels: { include: { label: true } },
        })
        .orderBy("id", direction)
        .limit(limit + 1)
        .get();

      const hasMore = rows.length > limit;
      const threads = hasMore ? rows.slice(0, limit) : rows;

      const nextCursor =
        hasMore && threads.length > 0
          ? (threads[threads.length - 1]?.id ?? null)
          : null;

      return { threads, nextCursor };
    }),
    // TODO(signals-overhaul issue 10): rewrite against thread.agentRead /
    // thread.inlineSuggestions (or replace with a new related-threads source).
    // The suggestion table backing this was dropped in issue 02; returns [] now.
    fetchRelatedThreads: mutation(
      z.object({
        threadId: z.string(),
        organizationId: z.string(),
      }),
    ).handler(async () => {
      return [];
    }),
    /**
     * @deprecated The web client now reads issues reactively from the
     * org-scoped `externalEntity` mirror (synced via Live-State). This on-demand
     * fetch is retired and stubbed to an empty result; the procedure surface is
     * kept so the Router type stays stable until all consumers are confirmed
     * migrated (FRO-185).
     */
    fetchGithubIssues: mutation(
      z.object({
        organizationId: z.string(),
        state: z.enum(["open", "closed", "all"]).optional().default("open"),
      }),
    ).handler(async () => {
      return { issues: [], count: 0 };
    }),
    /**
     * @deprecated The web client now reads pull requests reactively from the
     * org-scoped `externalEntity` mirror (synced via Live-State). This on-demand
     * fetch is retired and stubbed to an empty result; the procedure surface is
     * kept so the Router type stays stable until all consumers are confirmed
     * migrated (FRO-185).
     */
    fetchGithubPullRequests: mutation(
      z.object({
        organizationId: z.string(),
        state: z.enum(["open", "closed", "all"]).optional().default("open"),
      }),
    ).handler(async () => {
      return { pullRequests: [], count: 0 };
    }),
    createGithubIssue: mutation(
      z.object({
        organizationId: z.string(),
        threadId: z.string(),
        title: z.string(),
        body: z.string().optional(),
        owner: z.string(),
        repo: z.string(),
      }),
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
          }),
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
        }),
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
          r.owner === req.input.owner && r.name === req.input.repo,
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

      // The created issue propagates into the `externalEntity` mirror via the
      // GitHub webhook upsert, which syncs reactively to the web client.

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
    executeAutonomousBundle: mutation(
      executeAutonomousBundleInputSchema,
    ).handler(async ({ req, db }) => {
      if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      return runExecuteAutonomousBundle(db, req.input);
    }),
    acceptRead: mutation(acceptReadInputSchema).handler(async ({ req, db }) => {
      return runAcceptRead(req, db, req.input);
    }),
    dismissRead: mutation(dismissReadInputSchema).handler(
      async ({ req, db }) => {
        return runDismissRead(req, db, req.input);
      },
    ),
    acceptInlineSuggestion: mutation(acceptInlineSuggestionInputSchema).handler(
      async ({ req, db }) => {
        return runAcceptInlineSuggestion(req, db, req.input);
      },
    ),
    dismissInlineSuggestion: mutation(
      dismissInlineSuggestionInputSchema,
    ).handler(async ({ req, db }) => {
      return runDismissInlineSuggestion(req, db, req.input);
    }),
    upsertInlineSuggestion: mutation(upsertInlineSuggestionInputSchema).handler(
      async ({ req, db }) => {
        if (!req.context?.internalApiKey) {
          throw new Error("UNAUTHORIZED");
        }
        return runUpsertInlineSuggestion(db, req.input);
      },
    ),
    writeHintSlot: mutation(writeHintSlotInputSchema).handler(
      async ({ req, db }) => {
        if (!req.context?.internalApiKey) {
          throw new Error("UNAUTHORIZED");
        }
        return runWriteHintSlot(db, req.input);
      },
    ),
    setStatus: mutation(setStatusInputSchema).handler(async ({ req, db }) => {
      const hasInternalKey = !!req.context?.internalApiKey;

      if (hasInternalKey) {
        return runSetThreadStatus(
          db,
          req.input,
          {
            userId: null,
            userName: req.input.userName ?? null,
          },
          { recordActivity: req.input.recordActivity ?? false },
        );
      }

      if (
        req.input.recordActivity !== undefined ||
        req.input.activityMetadata !== undefined ||
        req.input.replicatedStr !== undefined
      ) {
        throw new Error("UNAUTHORIZED");
      }

      authorize(req, { organizationId: req.input.organizationId });

      const actorUserId = req.context?.session?.userId ?? null;
      if (!actorUserId) {
        throw new Error("UNAUTHORIZED");
      }

      return runSetThreadStatus(db, req.input, {
        userId: actorUserId,
        userName: req.context?.user?.name ?? null,
      });
    }),
    setPriority: mutation(setPriorityInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId });

      const actorUserId = req.context?.session?.userId ?? null;
      if (!actorUserId) {
        throw new Error("UNAUTHORIZED");
      }

      return runSetThreadPriority(db, req.input, {
        userId: actorUserId,
        userName: req.context?.user?.name ?? null,
      });
    }),
    assignUser: mutation(assignUserInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId });

      const actorUserId = req.context?.session?.userId ?? null;
      if (!actorUserId) {
        throw new Error("UNAUTHORIZED");
      }

      return runAssignThreadUser(db, req.input, {
        userId: actorUserId,
        userName: req.context?.user?.name ?? null,
      });
    }),
    linkIssue: mutation(linkIssueInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId });

      const actorUserId = req.context?.session?.userId ?? null;
      if (!actorUserId) {
        throw new Error("UNAUTHORIZED");
      }

      return runLinkIssue(db, req.input, {
        userId: actorUserId,
        userName: req.context?.user?.name ?? null,
      });
    }),
    unlinkIssue: mutation(unlinkIssueInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId });

      const actorUserId = req.context?.session?.userId ?? null;
      if (!actorUserId) {
        throw new Error("UNAUTHORIZED");
      }

      return runUnlinkIssue(db, req.input, {
        userId: actorUserId,
        userName: req.context?.user?.name ?? null,
      });
    }),
    linkPullRequest: mutation(linkPullRequestInputSchema).handler(
      async ({ req, db }) => {
        authorize(req, { organizationId: req.input.organizationId });

        const actorUserId = req.context?.session?.userId ?? null;
        if (!actorUserId) {
          throw new Error("UNAUTHORIZED");
        }

        return runLinkPullRequest(db, req.input, {
          userId: actorUserId,
          userName: req.context?.user?.name ?? null,
        });
      },
    ),
    unlinkPullRequest: mutation(unlinkPullRequestInputSchema).handler(
      async ({ req, db }) => {
        authorize(req, { organizationId: req.input.organizationId });

        const actorUserId = req.context?.session?.userId ?? null;
        if (!actorUserId) {
          throw new Error("UNAUTHORIZED");
        }

        return runUnlinkPullRequest(db, req.input, {
          userId: actorUserId,
          userName: req.context?.user?.name ?? null,
        });
      },
    ),
    markDuplicate: mutation(markDuplicateInputSchema).handler(
      async ({ req, db }) => {
        authorize(req, { organizationId: req.input.organizationId });

        const actorUserId = req.context?.session?.userId ?? null;
        if (!actorUserId) {
          throw new Error("UNAUTHORIZED");
        }

        return runMarkDuplicate(db, req.input, {
          userId: actorUserId,
          userName: req.context?.user?.name ?? null,
        });
      },
    ),
    archive: mutation(archiveThreadInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId });

      const actorUserId = req.context?.session?.userId ?? null;
      if (!actorUserId) {
        throw new Error("UNAUTHORIZED");
      }

      return runArchiveThread(db, req.input);
    }),
    restore: mutation(restoreThreadInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId });

      const actorUserId = req.context?.session?.userId ?? null;
      if (!actorUserId) {
        throw new Error("UNAUTHORIZED");
      }

      return runRestoreThread(db, req.input);
    }),
    setAgentRead: mutation(setAgentReadInputSchema).handler(
      async ({ req, db }) => {
        if (!req.context?.internalApiKey) {
          throw new Error("UNAUTHORIZED");
        }

        return runSetAgentRead(db, req.input);
      },
    ),
  }))
  .withHooks({
    // TODO: Migrate this logic into a custom `create` mutation and have the
    // integration apps (slack/discord/devtools) call that mutation instead of
    // inserting threads via the default `store.mutate.thread.insert(...)` path.
    // This hook runs post-commit, so shortId assignment isn't in the same
    // transaction as the insert — a failure here leaves the thread without a
    // shortId with no retry. A custom mutation can do the insert + shortId
    // assignment atomically (like the `create` mutation above already does).
    afterInsert: async ({ value, db }) => {
      if (value.shortId != null) return;
      try {
        const shortId = await nextThreadShortId(db, value.organizationId);
        await db.thread.update(value.id, { shortId });
      } catch (error) {
        console.error(`Failed to assign shortId to thread ${value.id}:`, error);
      }
    },
  });
