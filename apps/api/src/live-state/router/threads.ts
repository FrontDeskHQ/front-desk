// TODO refactor with new live-state mental model
import { invokeCapability } from "@connectors/framework";
import type { NormalizedIssue } from "@connectors/framework";
import { readCapabilityPrimary } from "@workspace/schemas/organization";
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
  connectorInvokeSecret,
  connectorRegistry,
} from "../../lib/connector-registry";
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
  createdAt: z.coerce.date().optional(),
  externalMessageId: z.string().nullable().optional(),
  id: z.string().optional(),
  isBackfill: z.boolean().optional(),
  origin: z.string().nullable().optional(),
});

const threadCreateInputSchema = z.object({
  author: integrationAuthorSchema.optional(),
  createdAt: z.coerce.date().optional(),
  externalId: z.string().nullable().optional(),
  externalMetadataStr: z.string().nullable().optional(),
  externalOrigin: z.string().nullable().optional(),
  firstMessage: integrationFirstMessageSchema.optional(),
  id: z.string().optional(),
  message: z.union([z.string(), z.any()]),
  organizationId: z.string().optional(),
  status: z.number().int().min(0).max(4).optional(),
  title: z.string().min(3),
  userId: z.string().optional(),
  userName: z.string().optional(),
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
      req.input.externalId !== undefined ||
      req.input.externalOrigin !== undefined ||
      req.input.externalMetadataStr !== undefined ||
      req.input.firstMessage !== undefined;

    const createFlow = authorizeThreadCreate(req, {
      hasIntegrationOnlyFields,
      inputUserId: req.input.userId,
      organizationId,
    });

    if (createFlow === "workspace" && !req.input.author) {
      throw new Error("MISSING_AUTHOR_INFO");
    }

    const content = serializeMessageContent(req.input.message);

    const threadId = req.input.id ?? ulid().toLowerCase();
    const { firstMessage } = req.input;

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
              organizationId,
              userId,
            },
          })
        );

        authorId = existingAuthor[0]?.id;

        if (!authorId) {
          authorId = ulid().toLowerCase();
          await trx.insert(schema.author, {
            id: authorId,
            metaId: null,
            name: userName,
            organizationId,
            userId,
          });
        }
      } else if (req.input.author) {
        // API key flow - use metaId
        const existingAuthor = Object.values(
          await trx.find(schema.author, {
            where: {
              metaId: req.input.author.id,
              organizationId,
            },
          })
        );

        authorId = existingAuthor[0]?.id;

        if (!authorId) {
          authorId = ulid().toLowerCase();
          await trx.insert(schema.author, {
            id: authorId,
            metaId: req.input.author.id,
            name: req.input.author.name,
            organizationId,
            userId: null,
          });
        }
      } else {
        throw new Error("MISSING_AUTHOR_INFO");
      }

      const shortId = await nextThreadShortId(trx, organizationId);

      // Create thread
      await trx.insert(schema.thread, {
        assignedUserId: null,
        authorId,
        createdAt: req.input.createdAt ?? new Date(),
        deletedAt: null,
        externalId: req.input.externalId ?? null,
        externalIssueId: null,
        externalMetadataStr: req.input.externalMetadataStr ?? null,
        externalOrigin: req.input.externalOrigin ?? null,
        externalPrId: null,
        id: threadId,
        name: req.input.title,
        organizationId,
        priority: 0,
        shortId,
        status: req.input.status ?? 0,
      });

      // Create first message
      await trx.insert(schema.message, {
        authorId,
        content,
        createdAt: firstMessage?.createdAt ?? new Date(),
        externalMessageId: firstMessage?.externalMessageId ?? null,
        id: firstMessage?.id ?? ulid().toLowerCase(),
        isBackfill: firstMessage?.isBackfill ?? false,
        origin: firstMessage?.origin ?? null,
        threadId,
      });
    });

    const thread = Object.values(
      await db.find(schema.thread, {
        include: {
          author: true,
          messages: {
            include: { author: true },
          },
        },
        where: { id: threadId },
      })
    )[0];

    return thread;
  }),
  list: query(
    z.object({
      assignedUserId: z.string().nullable().optional(),
      cursor: z.string().optional(),
      direction: z.enum(["asc", "desc"]).default("desc"),
      limit: z.number().min(1).max(50).default(10),
      organizationId: z.string(),
      priority: z.number().optional(),
      status: z.number().optional(),
    })
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

    let threadQuery = db.thread.where({
      deletedAt: null,
      organizationId,
    });

    if (status !== undefined) {
      threadQuery = threadQuery.where({ status });
    }
    if (priority !== undefined) {
      threadQuery = threadQuery.where({ priority });
    }
    if (assignedUserId !== undefined) {
      threadQuery = threadQuery.where({ assignedUserId });
    }

    if (cursor) {
      const op = direction === "desc" ? "$lt" : "$gt";
      threadQuery = threadQuery.where({ id: { [op]: cursor } });
    }

    const rows = await threadQuery
      .include({
        assignedUser: true,
        author: true,
        labels: { include: { label: true } },
        messages: { include: { author: true } },
      })
      .orderBy("id", direction)
      .limit(limit + 1)
      .get();

    const hasMore = rows.length > limit;
    const threads = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && threads.length > 0 ? (threads.at(-1)?.id ?? null) : null;

    return { nextCursor, threads };
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
        deletedBefore: z.coerce.date().optional(),
        id: z.string().optional(),
        onlyDeleted: z.boolean().optional(),
        organizationId: z.string().optional(),
        shortId: z.number().optional(),
      })
      .refine(
        (input) => input.id !== undefined || input.shortId !== undefined,
        { message: "THREAD_SELECTOR_REQUIRED" }
      )
      .refine(
        (input) =>
          input.shortId === undefined || input.organizationId !== undefined,
        { message: "SHORT_ID_REQUIRES_ORGANIZATION" }
      )
  ).handler(async ({ req, db }) => {
    const { id, shortId, organizationId, onlyDeleted, deletedBefore } =
      req.input;

    const rows = await db.thread
      .where({
        ...(id === undefined ? {} : { id }),
        ...(shortId === undefined ? {} : { shortId }),
        ...(organizationId === undefined ? {} : { organizationId }),
        deletedAt: onlyDeleted
          ? { $not: null, ...(deletedBefore ? { $lt: deletedBefore } : {}) }
          : null,
      })
      .include({
        assignedUser: true,
        author: true,
        labels: { include: { label: true } },
        messages: { include: { author: true } },
        organization: true,
        updates: { include: { user: true } },
      })
      .get();

    return rows[0];
  }),

  /** All threads with their org — sitemap generation. Public (open read). */
  listAll: query().handler(async ({ db }) =>
    db.thread
      .where({ deletedAt: null })
      .include({ messages: true, organization: true })
      .get()
  ),

  /** Thread lookup by external (platform) id — integration bot dedupe. */
  byExternalId: query(
    z.object({
      externalId: z.string(),
      // Required so dedupe/reads are always tenant-scoped — external ids can
      // collide across organizations.
      organizationId: z.string(),
      externalOrigin: z.string().optional(),
    })
  ).handler(async ({ req, db }) => {
    const { externalId, organizationId, externalOrigin } = req.input;
    return Object.values(
      await db.find(schema.thread, {
        where: {
          externalId,
          organizationId,
          ...(externalOrigin === undefined ? {} : { externalOrigin }),
        },
      })
    )[0];
  }),

  /**
   * Threads by id (with messages + labels) — worker pipeline reads. Accepts a
   * batch so callers can hydrate many threads in one round-trip.
   */
  byIds: query(z.object({ ids: z.array(z.string()) })).handler(
    async ({ req, db }) => {
      if (req.input.ids.length === 0) {
        return [];
      }
      return db.thread
        .where({ id: { $in: req.input.ids } })
        .include({
          labels: { include: { label: true } },
          messages: true,
        })
        .get();
    }
  ),

  // TODO(signals-overhaul issue 10): rewrite against thread.agentRead /
  // thread.inlineSuggestions (or replace with a new related-threads source).
  // The suggestion table backing this was dropped in issue 02; returns [] now.
  fetchRelatedThreads: mutation(
    z.object({
      organizationId: z.string(),
      threadId: z.string(),
    })
  ).handler(async () => []),
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
    })
  ).handler(async () => ({ issues: [], count: 0 })),
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
    })
  ).handler(async () => ({ pullRequests: [], count: 0 })),
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
    })
  ).handler(async ({ req, db }) => {
    const { organizationId } = req.input;

    if (!organizationId) {
      throw new Error("MISSING_ORGANIZATION_ID");
    }

    authorize(req, { organizationId });

    const actor = req.context?.internalApiKey ? null : getWorkspaceActor(req);

    // Resolve the target integration providing the issue-tracker capability
    // from the org's enabled integrations, via the registry.
    interface EnabledIntegration {
      id: string;
      type: string;
      configStr?: string | null;
      organization?: {
        settings: unknown;
        slug: string;
      };
    }

    const enabledIntegrations = Object.values(
      await db.find(schema.integration, {
        include: { organization: true },
        where: { enabled: true, organizationId },
      })
    ) as EnabledIntegration[];

    const providerTypes = new Set(
      connectorRegistry
        .providersOf("issue-tracker")
        .map((entry) => entry.manifest.type)
    );

    // When no target is implied (agent-initiated create, humans pin nothing),
    // fall back to the org's primary issue-tracker before the first provider.
    // Humans can still pin any target freely via `integrationId`.
    const primaryIssueTrackerId = readCapabilityPrimary(
      enabledIntegrations[0]?.organization?.settings,
      "issue-tracker"
    );

    const integration = req.input.integrationId
      ? enabledIntegrations.find(
          (i) => i.id === req.input.integrationId && providerTypes.has(i.type)
        )
      : ((primaryIssueTrackerId
          ? enabledIntegrations.find(
              (i) => i.id === primaryIssueTrackerId && providerTypes.has(i.type)
            )
          : undefined) ??
        enabledIntegrations.find((i) => providerTypes.has(i.type)));

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
    const orgSlug = integration.organization?.slug;
    if (!orgSlug) {
      throw new Error("ORGANIZATION_NOT_FOUND");
    }
    const threadPortalUrl = `https://${orgSlug}.tryfrontdesk.app/threads/${thread.id}`;
    const footer = `\n\n---\n\nIssue created using FrontDesk. [Click to view thread](${threadPortalUrl}).`;
    const body = (req.input.body ?? "") + footer;

    // Dispatch generically: the connector interprets its own opaque config
    // (`configStr`, forwarded untouched) and the target sub-resource.
    const { entity } = await invokeCapability<{ entity: NormalizedIssue }>(
      entry.invokeUrl,
      {
        capability: "issue-tracker",
        config: integration.configStr,
        method: "create",
        payload: {
          body,
          target: req.input.target,
          title: req.input.title,
        },
      },
      { secret: connectorInvokeSecret }
    );

    await runRecordActivity(db, {
      metadata: {
        issueId: entity.id,
        issueLabel: entity.label,
        issueShortId: entity.shortId,
      },
      organizationId,
      replicatedStr: null,
      threadId: req.input.threadId,
      type: "issue_created",
      userId: actor?.userId ?? null,
      userName: actor?.userName ?? null,
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
    }
  ),
  acceptRead: mutation(acceptReadInputSchema).handler(async ({ req, db }) =>
    runAcceptRead(req, db, req.input)
  ),
  dismissRead: mutation(dismissReadInputSchema).handler(async ({ req, db }) =>
    runDismissRead(req, db, req.input)
  ),
  acceptInlineSuggestion: mutation(acceptInlineSuggestionInputSchema).handler(
    async ({ req, db }) => runAcceptInlineSuggestion(req, db, req.input)
  ),
  dismissInlineSuggestion: mutation(dismissInlineSuggestionInputSchema).handler(
    async ({ req, db }) => runDismissInlineSuggestion(req, db, req.input)
  ),
  upsertInlineSuggestion: mutation(upsertInlineSuggestionInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);
      return runUpsertInlineSuggestion(db, req.input);
    }
  ),
  writeHintSlot: mutation(writeHintSlotInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);
      return runWriteHintSlot(db, req.input);
    }
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
        { recordActivity: req.input.recordActivity ?? false }
      );
    }

    assertInternalKeyForIntegrationFields(req, {
      activityMetadata: req.input.activityMetadata,
      recordActivity: req.input.recordActivity,
      replicatedStr: req.input.replicatedStr,
    });

    authorize(req, {
      allowInternalApiKey: false,
      organizationId: req.input.organizationId,
    });

    const actor = getWorkspaceActor(req);

    return runSetThreadStatus(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  setPriority: mutation(setPriorityInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      allowInternalApiKey: false,
      organizationId: req.input.organizationId,
    });

    const actor = getWorkspaceActor(req);

    return runSetThreadPriority(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  assignUser: mutation(assignUserInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      allowInternalApiKey: false,
      organizationId: req.input.organizationId,
    });

    const actor = getWorkspaceActor(req);

    return runAssignThreadUser(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  linkIssue: mutation(linkIssueInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      allowInternalApiKey: false,
      organizationId: req.input.organizationId,
    });

    const actor = getWorkspaceActor(req);

    return runLinkIssue(db, req.input, {
      userId: actor.userId,
      userName: actor.userName,
    });
  }),
  unlinkIssue: mutation(unlinkIssueInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      allowInternalApiKey: false,
      organizationId: req.input.organizationId,
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
        allowInternalApiKey: false,
        organizationId: req.input.organizationId,
      });

      const actor = getWorkspaceActor(req);

      return runLinkPullRequest(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    }
  ),
  unlinkPullRequest: mutation(unlinkPullRequestInputSchema).handler(
    async ({ req, db }) => {
      authorize(req, {
        allowInternalApiKey: false,
        organizationId: req.input.organizationId,
      });

      const actor = getWorkspaceActor(req);

      return runUnlinkPullRequest(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    }
  ),
  markDuplicate: mutation(markDuplicateInputSchema).handler(
    async ({ req, db }) => {
      authorize(req, {
        allowInternalApiKey: false,
        organizationId: req.input.organizationId,
      });

      const actor = getWorkspaceActor(req);

      return runMarkDuplicate(db, req.input, {
        userId: actor.userId,
        userName: actor.userName,
      });
    }
  ),
  archive: mutation(archiveThreadInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      allowInternalApiKey: false,
      organizationId: req.input.organizationId,
    });

    getWorkspaceActor(req);

    return runArchiveThread(db, req.input);
  }),
  restore: mutation(restoreThreadInputSchema).handler(async ({ req, db }) => {
    authorize(req, {
      allowInternalApiKey: false,
      organizationId: req.input.organizationId,
    });

    getWorkspaceActor(req);

    return runRestoreThread(db, req.input);
  }),
  setAgentRead: mutation(setAgentReadInputSchema).handler(
    async ({ req, db }) => {
      requireInternalApiKey(req.context);

      return runSetAgentRead(db, req.input);
    }
  ),
}));
