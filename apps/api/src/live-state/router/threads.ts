// TODO refactor with new live-state mental model
import { invokeCapability, type NormalizedIssue } from "@connectors/framework";
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
import { connectorRegistry } from "../../lib/connector-registry";
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
import { nextThreadShortId } from "../../lib/thread-short-id";
import { serializeMessageContent } from "../../lib/tiptap-content";
import { runRecordActivity } from "../../lib/update-mutations";
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
      // Required so dedupe/reads are always tenant-scoped — external ids can
      // collide across organizations.
      organizationId: z.string(),
      externalOrigin: z.string().optional(),
    }),
  ).handler(async ({ req, db }) => {
    const { externalId, organizationId, externalOrigin } = req.input;
    return Object.values(
      await db.find(schema.thread, {
        where: {
          externalId,
          organizationId,
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
  createIssue: mutation(
    z.object({
      organizationId: z.string(),
      threadId: z.string(),
      title: z.string(),
      body: z.string().optional(),
      // Opaque, connector-interpreted sub-resource selector (e.g. GitHub
      // `{ owner, repo }`). Core forwards it untouched.
      target: z.record(z.string(), z.unknown()),
      // Optionally pin a specific issue-tracker integration; otherwise the
      // org's first enabled provider is used.
      integrationId: z.string().optional(),
    }),
  ).handler(async ({ req, db }) => {
    const organizationId = req.input.organizationId;

    if (!organizationId) {
      throw new Error("MISSING_ORGANIZATION_ID");
    }

    authorize(req, { organizationId });

    const actor = req.context?.internalApiKey ? null : getWorkspaceActor(req);

    // Resolve the target integration providing the issue-tracker capability
    // from the org's enabled integrations, via the registry.
    const enabledIntegrations = Object.values(
      await db.find(schema.integration, {
        where: { organizationId, enabled: true },
        include: { organization: true },
      }),
    ) as any[]; // TODO: Remove type assertion when live-state supports includes properly

    const providerTypes = new Set(
      connectorRegistry
        .providersOf("issue-tracker")
        .map((entry) => entry.manifest.type),
    );

    const integration = req.input.integrationId
      ? enabledIntegrations.find(
          (i) => i.id === req.input.integrationId && providerTypes.has(i.type),
        )
      : enabledIntegrations.find((i) => providerTypes.has(i.type));

    if (!integration) {
      throw new Error("ISSUE_TRACKER_NOT_CONFIGURED");
    }

    const entry = connectorRegistry.getByType(integration.type);
    if (!entry) {
      throw new Error("CONNECTOR_NOT_REGISTERED");
    }

    // An integration can be enabled before it's configured (`configStr` is
    // nullable); fail with a clear error rather than forwarding a null config.
    if (!integration.configStr) {
      throw new Error("ISSUE_TRACKER_NOT_CONFIGURED");
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

    // Dispatch generically: the connector interprets its own opaque config
    // (`configStr`, forwarded untouched) and the target sub-resource.
    const { entity } = await invokeCapability<{ entity: NormalizedIssue }>(
      entry.invokeUrl,
      {
        capability: "issue-tracker",
        method: "create",
        config: integration.configStr,
        payload: {
          title: req.input.title,
          body,
          target: req.input.target,
        },
      },
    );

    await runRecordActivity(db, {
      threadId: req.input.threadId,
      organizationId,
      userId: actor?.userId ?? null,
      userName: actor?.userName ?? null,
      type: "issue_created",
      metadata: {
        issueId: entity.id,
        issueNumber: entity.number,
        issueLabel: entity.label,
      },
      replicatedStr: null,
    });

    // The created issue propagates into the `externalEntity` mirror via the
    // connector's webhook upsert, which syncs reactively to the web client.

    return {
      issue: entity,
    };
  }),
  executeAutonomousBundle: mutation(executeAutonomousBundleInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);

      return runExecuteAutonomousBundle(db, req.input);
    },
  ),
  acceptRead: mutation(acceptReadInputSchema).handler(async ({ req, db }) => {
    return runAcceptRead(req, db, req.input);
  }),
  dismissRead: mutation(dismissReadInputSchema).handler(async ({ req, db }) => {
    return runDismissRead(req, db, req.input);
  }),
  acceptInlineSuggestion: mutation(acceptInlineSuggestionInputSchema).handler(
    async ({ req, db }) => {
      return runAcceptInlineSuggestion(req, db, req.input);
    },
  ),
  dismissInlineSuggestion: mutation(dismissInlineSuggestionInputSchema).handler(
    async ({ req, db }) => {
      return runDismissInlineSuggestion(req, db, req.input);
    },
  ),
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

    authorize(req, {
      organizationId: req.input.organizationId,
      allowInternalApiKey: false,
    });

    const actor = getWorkspaceActor(req);

    return runSetThreadStatus(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  setPriority: mutation(setPriorityInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      organizationId: req.input.organizationId,
      allowInternalApiKey: false,
    });

    const actor = getWorkspaceActor(req);

    return runSetThreadPriority(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  assignUser: mutation(assignUserInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      organizationId: req.input.organizationId,
      allowInternalApiKey: false,
    });

    const actor = getWorkspaceActor(req);

    return runAssignThreadUser(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  linkIssue: mutation(linkIssueInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      organizationId: req.input.organizationId,
      allowInternalApiKey: false,
    });

    const actor = getWorkspaceActor(req);

    return runLinkIssue(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  unlinkIssue: mutation(unlinkIssueInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      organizationId: req.input.organizationId,
      allowInternalApiKey: false,
    });

    const actor = getWorkspaceActor(req);

    return runUnlinkIssue(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  linkPullRequest: mutation(linkPullRequestInputSchema).handler(
    async ({ req, db }) => {
      authorize(req, {
        organizationId: req.input.organizationId,
        allowInternalApiKey: false,
      });

      const actor = getWorkspaceActor(req);

      return runLinkPullRequest(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    },
  ),
  unlinkPullRequest: mutation(unlinkPullRequestInputSchema).handler(
    async ({ req, db }) => {
      authorize(req, {
        organizationId: req.input.organizationId,
        allowInternalApiKey: false,
      });

      const actor = getWorkspaceActor(req);

      return runUnlinkPullRequest(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    },
  ),
  markDuplicate: mutation(markDuplicateInputSchema).handler(
    async ({ req, db }) => {
      authorize(req, {
        organizationId: req.input.organizationId,
        allowInternalApiKey: false,
      });

      const actor = getWorkspaceActor(req);

      return runMarkDuplicate(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    },
  ),
  archive: mutation(archiveThreadInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      organizationId: req.input.organizationId,
      allowInternalApiKey: false,
    });

    getWorkspaceActor(req);

    return runArchiveThread(db, req.input);
  }),
  restore: mutation(restoreThreadInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      organizationId: req.input.organizationId,
      allowInternalApiKey: false,
    });

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
