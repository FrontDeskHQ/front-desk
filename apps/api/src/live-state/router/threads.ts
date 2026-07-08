// TODO refactor with new live-state mental model
import { formatGitHubId } from "@workspace/schemas/external-issue";
import { ulid } from "ulid";
import z from "zod";
import {
  assertInternalKeyForIntegrationFields,
  authorize,
  authorizeThreadCreate,
  getPortalAuthor,
  getWorkspaceActor,
  requireInternalApiKey,
} from "../../lib/authorize";
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
import { runRecordActivity } from "../../lib/update-mutations";
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

export default publicRoute.withProcedures(({ mutation, query }) => ({
    create: mutation(threadCreateInputSchema).handler(async ({ req, db }) => {
      const organizationId =
        req.context?.publicApiKey?.ownerId ?? req.input.organizationId;

      if (!organizationId) {
        throw new Error("MISSING_ORGANIZATION_ID");
      }

      const hasIntegrationOnlyFields =
        req.input.id !== undefined ||
        req.input.createdAt !== undefined ||
        req.input.status !== undefined ||
        req.input.discordChannelId !== undefined ||
        req.input.externalId !== undefined ||
        req.input.externalOrigin !== undefined ||
        req.input.externalMetadataStr !== undefined ||
        req.input.firstMessage !== undefined;

      const createFlow = authorizeThreadCreate(req, {
        organizationId,
        inputUserId: req.input.userId,
        hasIntegrationOnlyFields,
      });

      if (createFlow === "workspace" && !req.input.author) {
        throw new Error("MISSING_AUTHOR_INFO");
      }

      const content = serializeMessageContent(req.input.message);

      const threadId = req.input.id ?? ulid().toLowerCase();
      const firstMessage = req.input.firstMessage;

      await db.transaction(async ({ trx }) => {
        let authorId: string | undefined;

        // Determine author based on context
        if (createFlow === "portal") {
          const { userId, userName } = getPortalAuthor(req, {
            userName: req.input.userName,
          });

          const existingAuthor = Object.values(
            await trx.find(schema.author, {
              where: {
                userId,
                organizationId,
              },
            }),
          );

          authorId = existingAuthor[0]?.id;

          if (!authorId) {
            authorId = ulid().toLowerCase();
            await trx.insert(schema.author, {
              id: authorId,
              userId,
              metaId: null,
              name: userName,
              organizationId,
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

    /**
     * Single thread with its full relation tree — portal thread page, workspace
     * archive view, and devtools. Public, matching the old open `read` on
     * threads. `onlyDeleted`/`deletedBefore` serve the archive (soft-deleted,
     * pre-purge-window) lookups.
     */
    detail: query(
      z
        .object({
          id: z.string().optional(),
          shortId: z.number().optional(),
          organizationId: z.string().optional(),
          onlyDeleted: z.boolean().optional(),
          deletedBefore: z.coerce.date().optional(),
        })
        .refine(
          (input) => input.id !== undefined || input.shortId !== undefined,
          { message: "THREAD_SELECTOR_REQUIRED" },
        )
        .refine(
          (input) =>
            input.shortId === undefined || input.organizationId !== undefined,
          { message: "SHORT_ID_REQUIRES_ORGANIZATION" },
        ),
    ).handler(async ({ req, db }) => {
      const { id, shortId, organizationId, onlyDeleted, deletedBefore } =
        req.input;

      const rows = await db.thread
        .where({
          ...(id !== undefined ? { id } : {}),
          ...(shortId !== undefined ? { shortId } : {}),
          ...(organizationId !== undefined ? { organizationId } : {}),
          deletedAt: onlyDeleted
            ? { $not: null, ...(deletedBefore ? { $lt: deletedBefore } : {}) }
            : null,
        })
        .include({
          author: true,
          organization: true,
          messages: { include: { author: true } },
          assignedUser: true,
          updates: { include: { user: true } },
          labels: { include: { label: true } },
        })
        .get();

      return rows[0];
    }),

    /** All threads with their org — sitemap generation. Public (open read). */
    listAll: query().handler(async ({ db }) =>
      db.thread
        .where({ deletedAt: null })
        .include({ organization: true, messages: true })
        .get(),
    ),

    /** Thread lookup by external (platform) id — integration bot dedupe. */
    byExternalId: query(
      z.object({
        externalId: z.string(),
        organizationId: z.string().optional(),
        externalOrigin: z.string().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const { externalId, organizationId, externalOrigin } = req.input;
      return Object.values(
        await db.find(schema.thread, {
          where: {
            externalId,
            ...(organizationId !== undefined ? { organizationId } : {}),
            ...(externalOrigin !== undefined ? { externalOrigin } : {}),
          },
        }),
      )[0];
    }),

    /**
     * Threads by id (with messages + labels) — worker pipeline reads. Accepts a
     * batch so callers can hydrate many threads in one round-trip.
     */
    byIds: query(z.object({ ids: z.array(z.string()) })).handler(
      async ({ req, db }) => {
        if (req.input.ids.length === 0) return [];
        return db.thread
          .where({ id: { $in: req.input.ids } })
          .include({
            messages: true,
            labels: { include: { label: true } },
          })
          .get();
      },
    ),

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

      authorize(req, { organizationId });

      const actor = req.context?.internalApiKey
        ? null
        : getWorkspaceActor(req);

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

      await runRecordActivity(db, {
        threadId: req.input.threadId,
        organizationId,
        userId: actor?.userId ?? null,
        type: "github_issue_created",
        metadata: {
          issueId: data.issue.id,
          issueNumber: data.issue.number,
          issueLabel: `${req.input.owner}/${req.input.repo}#${data.issue.number}`,
        },
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
      requireInternalApiKey(req.context);

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
        requireInternalApiKey(req.context);
        return runUpsertInlineSuggestion(db, req.input);
      },
    ),
    writeHintSlot: mutation(writeHintSlotInputSchema).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);
        return runWriteHintSlot(db, req.input);
      },
    ),
    setStatus: mutation(setStatusInputSchema).handler(async ({ req, db }) => {
      if (req.context?.internalApiKey) {
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

      assertInternalKeyForIntegrationFields(req, {
        recordActivity: req.input.recordActivity,
        activityMetadata: req.input.activityMetadata,
        replicatedStr: req.input.replicatedStr,
      });

      authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

      const actor = getWorkspaceActor(req);

      return runSetThreadStatus(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    }),
    setPriority: mutation(setPriorityInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

      const actor = getWorkspaceActor(req);

      return runSetThreadPriority(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    }),
    assignUser: mutation(assignUserInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

      const actor = getWorkspaceActor(req);

      return runAssignThreadUser(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    }),
    linkIssue: mutation(linkIssueInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

      const actor = getWorkspaceActor(req);

      return runLinkIssue(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    }),
    unlinkIssue: mutation(unlinkIssueInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

      const actor = getWorkspaceActor(req);

      return runUnlinkIssue(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    }),
    linkPullRequest: mutation(linkPullRequestInputSchema).handler(
      async ({ req, db }) => {
        authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

        const actor = getWorkspaceActor(req);

        return runLinkPullRequest(db, req.input, {
          userId: actor.userId,
          userName: actor.userName,
        });
      },
    ),
    unlinkPullRequest: mutation(unlinkPullRequestInputSchema).handler(
      async ({ req, db }) => {
        authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

        const actor = getWorkspaceActor(req);

        return runUnlinkPullRequest(db, req.input, {
          userId: actor.userId,
          userName: actor.userName,
        });
      },
    ),
    markDuplicate: mutation(markDuplicateInputSchema).handler(
      async ({ req, db }) => {
        authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

        const actor = getWorkspaceActor(req);

        return runMarkDuplicate(db, req.input, {
          userId: actor.userId,
          userName: actor.userName,
        });
      },
    ),
    archive: mutation(archiveThreadInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

      getWorkspaceActor(req);

      return runArchiveThread(db, req.input);
    }),
    restore: mutation(restoreThreadInputSchema).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId, allowInternalApiKey: false });

      getWorkspaceActor(req);

      return runRestoreThread(db, req.input);
    }),
    setAgentRead: mutation(setAgentReadInputSchema).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);

        return runSetAgentRead(db, req.input);
      },
    ),
  }));
