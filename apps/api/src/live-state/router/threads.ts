// TODO refactor with new live-state mental model
import { callerOriginSchema } from "@workspace/schemas/message-roles";
import { ulid } from "ulid";
import z from "zod";

import {
  assertInternalKeyForIntegrationFields,
  authorize,
  authorizeDeveloperAction,
  authorizeThreadCreate,
  getWorkspaceActor,
  requireInternalApiKey,
} from "../../lib/authorize";
import { ensureExternalAuthor } from "../../lib/external-author";
import { runCreateIssue } from "../../lib/issue-tracker";
import { firstOrganizationAssigneeId } from "../../lib/organization-membership";
import { enqueueThreadRead } from "../../lib/queue";
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
  origin: callerOriginSchema,
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
      req.context?.privateApiKey?.ownerId ??
      req.context?.publicApiKey?.ownerId ??
      req.input.organizationId;

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

      if (req.input.author) {
        authorId = await ensureExternalAuthor(trx, {
          metaId: req.input.author.id,
          name: req.input.author.name,
          organizationId,
        });
      } else {
        throw new Error("MISSING_AUTHOR_INFO");
      }

      const shortId = await nextThreadShortId(trx, organizationId);
      const assignedUserId = await firstOrganizationAssigneeId(
        trx,
        organizationId
      );

      // Create thread
      await trx.insert(schema.thread, {
        assignedUserId,
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
  /**
   * Single thread with its full relation tree for the workspace archive and
   * developer tools. `onlyDeleted`/`deletedBefore` serve the archive
   * (soft-deleted, pre-purge-window) lookups.
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
        messages: { include: { author: { include: { user: true } } } },
        organization: true,
        updates: { include: { user: true } },
      })
      .get();

    const thread = rows[0];
    if (!thread) {
      return undefined;
    }

    authorize(req, { organizationId: thread.organizationId });
    return thread;
  }),

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
        .where({ deletedAt: null, id: { $in: req.input.ids } })
        .include({
          labels: { include: { label: true } },
          messages: true,
        })
        .get();
    }
  ),

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

    // Verify thread exists and belongs to the organization
    const thread = await db.findOne(schema.thread, req.input.threadId);
    if (!thread || thread.organizationId !== organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    // Client-orchestrated: this returns the created entity and the browser then
    // calls `thread.linkIssue`. The Agent cannot do that — it has no browser on
    // either the `auto` (worker) or accept (API) path — so its `create_issue`
    // handler creates *and* links in one server-side step instead.
    const entity = await runCreateIssue(db, {
      actorUserId: actor?.userId ?? null,
      actorUserName: actor?.userName ?? null,
      body: req.input.body,
      integrationId: req.input.integrationId,
      organizationId,
      target: req.input.target,
      threadId: req.input.threadId,
      title: req.input.title,
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
  retriggerRead: mutation(
    z.object({
      organizationId: z.string(),
      threadId: z.string(),
    })
  ).handler(async ({ req, db }) => {
    authorizeDeveloperAction(req, req.input.organizationId, {
      action: "thread_read_retrigger",
    });

    const thread = await db.findOne(schema.thread, req.input.threadId);
    if (!thread || thread.organizationId !== req.input.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    return enqueueThreadRead(req.input.threadId, {
      delayMs: 0,
      kind: "manual",
      organizationId: req.input.organizationId,
      priority: "high",
    });
  }),
}));
