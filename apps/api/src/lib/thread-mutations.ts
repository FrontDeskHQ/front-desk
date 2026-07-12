import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";
import { PRIORITY_LABELS, threadReadSchema } from "@workspace/schemas/signals";
import { addDays } from "date-fns";
import { z } from "zod";
import { schema } from "../live-state/schema";
import { syncLinkedIssueState } from "./capability-dispatch";
import { statusActivityMetadata } from "./signals/activity";
import { runRecordActivity } from "./update-mutations";

export const setStatusInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  status: z.number().int().min(0).max(4),
  source: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  /** Internal API key only — insert timeline row without a session actor. */
  recordActivity: z.boolean().optional(),
  activityMetadata: z.record(z.string(), z.unknown()).optional(),
  replicatedStr: z.string().optional(),
});

export const setPriorityInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  priority: z.number().int().min(0).max(4),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const assignUserInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  assignedUserId: z.string().nullable(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const linkIssueInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  externalIssueId: z.string().min(1),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const unlinkIssueInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const linkPullRequestInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  externalPrId: z.string().min(1),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const unlinkPullRequestInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const STATUS_CLOSED = 3;
export const STATUS_DUPLICATED = 4;

export const markDuplicateInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  duplicateOfThreadId: z.string().min(1),
  duplicateOfThreadName: z.string().optional(),
  source: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const THREAD_DELETION_GRACE_DAYS = 30;

export const archiveThreadInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
});

export const restoreThreadInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
});

export const setAgentReadInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  agentRead: threadReadSchema.nullable(),
});

type ThreadWriteDb = Pick<ServerDB<typeof schema>, "thread" | "insert">;

type ThreadAssignDb = ThreadWriteDb &
  Pick<ServerDB<typeof schema>, "organizationUser">;

type ThreadIssueLinkDb = ThreadWriteDb &
  Pick<ServerDB<typeof schema>, "find">;

type ExternalEntityKind = "issue" | "pull_request";

const externalEntityLinkConfig = {
  issue: {
    threadField: "externalIssueId" as const,
    updateType: "issue_changed" as const,
    entityType: "issue" as const,
    metadataKeys: {
      oldId: "oldIssueId",
      newId: "newIssueId",
      oldLabel: "oldIssueLabel",
      newLabel: "newIssueLabel",
    },
  },
  pull_request: {
    threadField: "externalPrId" as const,
    updateType: "pr_changed" as const,
    entityType: "pull_request" as const,
    metadataKeys: {
      oldId: "oldPrId",
      newId: "newPrId",
      oldLabel: "oldPrLabel",
      newLabel: "newPrLabel",
    },
  },
} satisfies Record<
  ExternalEntityKind,
  {
    threadField: "externalIssueId" | "externalPrId";
    updateType: "issue_changed" | "pr_changed";
    entityType: ExternalEntityKind;
    metadataKeys: {
      oldId: string;
      newId: string;
      oldLabel: string;
      newLabel: string;
    };
  }
>;

const priorityActivityMetadata = (oldPriority: number, newPriority: number) => ({
  oldPriority,
  newPriority,
  oldPriorityLabel: PRIORITY_LABELS[oldPriority] ?? null,
  newPriorityLabel: PRIORITY_LABELS[newPriority] ?? null,
});

const resolveAssignedUserName = async (
  db: Pick<ServerDB<typeof schema>, "organizationUser">,
  organizationId: string,
  userId: string | null,
) => {
  if (!userId) return null;

  const orgUser = await db.organizationUser
    .first({ organizationId, userId, enabled: true })
    .include({ user: true })
    .get();

  return orgUser?.user?.name ?? null;
};

type ThreadRow = InferLiveObject<typeof schema.thread>;

export const runSetThreadStatus = async (
  db: ThreadWriteDb & Pick<ServerDB<typeof schema>, "find">,
  input: z.infer<typeof setStatusInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
  options?: {
    preloadedThread?: ThreadRow;
    recordActivity?: boolean;
  },
) => {
  const thread =
    options?.preloadedThread ??
    (await db.thread.one(input.threadId).get());
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldStatus = thread.status ?? 0;
  if (oldStatus === input.status) {
    return { thread, unchanged: true as const };
  }

  await db.thread.update(input.threadId, { status: input.status });

  // Keep a linked external issue in sync with the thread's closed state. Only
  // fires when the thread crosses the closed boundary; routed by the linked
  // issue's owning integration (best-effort, never blocks the status change).
  // Statuses at or beyond `closed` (e.g. `duplicated`) count as closed.
  const wasClosed = oldStatus >= STATUS_CLOSED;
  const isClosed = input.status >= STATUS_CLOSED;
  if (thread.externalIssueId && wasClosed !== isClosed) {
    await syncLinkedIssueState(db, {
      organizationId: input.organizationId,
      externalIssueId: thread.externalIssueId,
      closed: isClosed,
    });
  }

  const shouldRecordActivity =
    actor.userId !== null || options?.recordActivity === true;

  if (shouldRecordActivity) {
    await runRecordActivity(db, {
      threadId: input.threadId,
      organizationId: input.organizationId,
      userId: actor.userId,
      userName: actor.userName,
      type: "status_changed",
      metadata: {
        ...statusActivityMetadata(oldStatus, input.status),
        ...(input.source ? { source: input.source } : {}),
        ...(input.activityMetadata ?? {}),
      },
      replicatedStr: input.replicatedStr ?? JSON.stringify({}),
    });
  }

  return {
    thread: { ...thread, status: input.status },
    oldStatus,
    newStatus: input.status,
  };
};

export const runSetThreadPriority = async (
  db: ThreadWriteDb,
  input: z.infer<typeof setPriorityInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) => {
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldPriority = thread.priority ?? 0;
  if (oldPriority === input.priority) {
    return { thread, unchanged: true as const };
  }

  await db.thread.update(input.threadId, { priority: input.priority });

  if (actor.userId !== null) {
    await runRecordActivity(db, {
      threadId: input.threadId,
      organizationId: input.organizationId,
      userId: actor.userId,
      userName: actor.userName,
      type: "priority_changed",
      metadata: priorityActivityMetadata(oldPriority, input.priority),
    });
  }

  const updated = await db.thread.one(input.threadId).get();
  return { thread: updated, oldPriority, newPriority: input.priority };
};

export const runAssignThreadUser = async (
  db: ThreadAssignDb,
  input: z.infer<typeof assignUserInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) => {
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldAssignedUserId = thread.assignedUserId ?? null;
  const newAssignedUserId = input.assignedUserId;
  if (oldAssignedUserId === newAssignedUserId) {
    return { thread, unchanged: true as const };
  }

  if (newAssignedUserId !== null) {
    const assignee = await db.organizationUser
      .first({
        organizationId: input.organizationId,
        userId: newAssignedUserId,
        enabled: true,
      })
      .get();
    if (!assignee) {
      throw new Error("ASSIGNEE_NOT_IN_ORGANIZATION");
    }
  }

  const [oldAssignedUserName, newAssignedUserName] = await Promise.all([
    resolveAssignedUserName(db, input.organizationId, oldAssignedUserId),
    resolveAssignedUserName(db, input.organizationId, newAssignedUserId),
  ]);

  await db.thread.update(input.threadId, {
    assignedUserId: newAssignedUserId,
  });

  if (actor.userId !== null) {
    await runRecordActivity(db, {
      threadId: input.threadId,
      organizationId: input.organizationId,
      userId: actor.userId,
      userName: actor.userName,
      type: "assigned_changed",
      metadata: {
        oldAssignedUserId,
        newAssignedUserId,
        oldAssignedUserName,
        newAssignedUserName,
      },
    });
  }

  const updated = await db.thread
    .one(input.threadId)
    .include({ assignedUser: true })
    .get();
  return {
    thread: updated,
    oldAssignedUserId,
    newAssignedUserId,
  };
};

const resolveExternalEntityLabel = async (
  db: Pick<ServerDB<typeof schema>, "find">,
  organizationId: string,
  externalKey: string | null,
  type: ExternalEntityKind,
) => {
  if (!externalKey) return null;

  const entity = Object.values(
    await db.find(schema.externalEntity, {
      where: { organizationId, externalKey, type },
    }),
  )[0];

  if (!entity) return null;
  return `${entity.repoFullName}#${entity.number}`;
};

const runLinkExternalEntity = async (
  db: ThreadIssueLinkDb,
  kind: ExternalEntityKind,
  input: {
    threadId: string;
    organizationId: string;
    externalId: string;
  },
  actor: {
    userId: string | null;
    userName: string | null;
  },
) => {
  const config = externalEntityLinkConfig[kind];
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldId = thread[config.threadField] ?? null;
  if (oldId === input.externalId) {
    return { thread, unchanged: true as const };
  }

  const [oldLabel, newLabel] = await Promise.all([
    resolveExternalEntityLabel(
      db,
      input.organizationId,
      oldId,
      config.entityType,
    ),
    resolveExternalEntityLabel(
      db,
      input.organizationId,
      input.externalId,
      config.entityType,
    ),
  ]);

  await db.thread.update(input.threadId, {
    [config.threadField]: input.externalId,
  });

  if (actor.userId !== null) {
    await runRecordActivity(db, {
      threadId: input.threadId,
      organizationId: input.organizationId,
      userId: actor.userId,
      userName: actor.userName,
      type: config.updateType,
      metadata: {
        [config.metadataKeys.oldId]: oldId,
        [config.metadataKeys.newId]: input.externalId,
        [config.metadataKeys.oldLabel]: oldLabel,
        [config.metadataKeys.newLabel]: newLabel,
      },
    });
  }

  const updated = await db.thread.one(input.threadId).get();
  return {
    thread: updated,
    [config.metadataKeys.oldId]: oldId,
    [config.metadataKeys.newId]: input.externalId,
  };
};

const runUnlinkExternalEntity = async (
  db: ThreadIssueLinkDb,
  kind: ExternalEntityKind,
  input: {
    threadId: string;
    organizationId: string;
  },
  actor: {
    userId: string | null;
    userName: string | null;
  },
) => {
  const config = externalEntityLinkConfig[kind];
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldId = thread[config.threadField] ?? null;
  if (oldId === null) {
    return { thread, unchanged: true as const };
  }

  const oldLabel = await resolveExternalEntityLabel(
    db,
    input.organizationId,
    oldId,
    config.entityType,
  );

  await db.thread.update(input.threadId, { [config.threadField]: null });

  if (actor.userId !== null) {
    await runRecordActivity(db, {
      threadId: input.threadId,
      organizationId: input.organizationId,
      userId: actor.userId,
      userName: actor.userName,
      type: config.updateType,
      metadata: {
        [config.metadataKeys.oldId]: oldId,
        [config.metadataKeys.newId]: null,
        [config.metadataKeys.oldLabel]: oldLabel,
        [config.metadataKeys.newLabel]: null,
      },
    });
  }

  const updated = await db.thread.one(input.threadId).get();
  return {
    thread: updated,
    [config.metadataKeys.oldId]: oldId,
    [config.metadataKeys.newId]: null,
  };
};

export const runLinkIssue = async (
  db: ThreadIssueLinkDb,
  input: z.infer<typeof linkIssueInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) =>
  runLinkExternalEntity(db, "issue", {
    threadId: input.threadId,
    organizationId: input.organizationId,
    externalId: input.externalIssueId,
  }, actor);

export const runUnlinkIssue = async (
  db: ThreadIssueLinkDb,
  input: z.infer<typeof unlinkIssueInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) =>
  runUnlinkExternalEntity(db, "issue", {
    threadId: input.threadId,
    organizationId: input.organizationId,
  }, actor);

export const runLinkPullRequest = async (
  db: ThreadIssueLinkDb,
  input: z.infer<typeof linkPullRequestInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) =>
  runLinkExternalEntity(db, "pull_request", {
    threadId: input.threadId,
    organizationId: input.organizationId,
    externalId: input.externalPrId,
  }, actor);

export const runUnlinkPullRequest = async (
  db: ThreadIssueLinkDb,
  input: z.infer<typeof unlinkPullRequestInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) =>
  runUnlinkExternalEntity(db, "pull_request", {
    threadId: input.threadId,
    organizationId: input.organizationId,
  }, actor);

export const runMarkDuplicate = async (
  db: ThreadWriteDb,
  input: z.infer<typeof markDuplicateInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
  options?: {
    preloadedThread?: ThreadRow;
  },
) => {
  if (input.duplicateOfThreadId === input.threadId) {
    throw new Error("CANNOT_MARK_DUPLICATE_OF_SELF");
  }

  const thread =
    options?.preloadedThread ??
    (await db.thread
      .first({ id: input.threadId, organizationId: input.organizationId })
      .get());
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const target = await db.thread
    .first({
      id: input.duplicateOfThreadId,
      organizationId: input.organizationId,
    })
    .get();
  if (!target) {
    throw new Error("TARGET_THREAD_NOT_FOUND");
  }

  const oldStatus = thread.status ?? 0;
  if (oldStatus === STATUS_DUPLICATED) {
    return { thread, unchanged: true as const };
  }

  await db.thread.update(input.threadId, { status: STATUS_DUPLICATED });

  const duplicateOfThreadName = input.duplicateOfThreadName ?? target.name;

  await runRecordActivity(db, {
    threadId: input.threadId,
    organizationId: input.organizationId,
    userId: actor.userId,
    userName: actor.userName,
    type: "marked_duplicate",
    metadata: {
      duplicateOfThreadId: input.duplicateOfThreadId,
      duplicateOfThreadName,
      ...(input.source ? { source: input.source } : {}),
    },
  });

  return {
    thread: { ...thread, status: STATUS_DUPLICATED },
    oldStatus,
    duplicateOfThreadId: input.duplicateOfThreadId,
    duplicateOfThreadName,
  };
};

export const runArchiveThread = async (
  db: ThreadWriteDb,
  input: z.infer<typeof archiveThreadInputSchema>,
  options?: {
    preloadedThread?: ThreadRow;
  },
) => {
  const thread =
    options?.preloadedThread ??
    (await db.thread
      .first({ id: input.threadId, organizationId: input.organizationId })
      .get());
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  if (thread.deletedAt != null) {
    return { thread, unchanged: true as const };
  }

  const deletedAt = addDays(new Date(), THREAD_DELETION_GRACE_DAYS);
  await db.thread.update(input.threadId, { deletedAt });

  return {
    thread: { ...thread, deletedAt },
    deletedAt,
  };
};

export const runRestoreThread = async (
  db: ThreadWriteDb,
  input: z.infer<typeof restoreThreadInputSchema>,
  options?: {
    preloadedThread?: ThreadRow;
  },
) => {
  const thread =
    options?.preloadedThread ??
    (await db.thread
      .first({ id: input.threadId, organizationId: input.organizationId })
      .get());
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  if (thread.deletedAt == null) {
    return { thread, unchanged: true as const };
  }

  await db.thread.update(input.threadId, { deletedAt: null });

  return {
    thread: { ...thread, deletedAt: null },
  };
};

export const runSetAgentRead = async (
  db: Pick<ServerDB<typeof schema>, "thread">,
  input: z.infer<typeof setAgentReadInputSchema>,
  options?: {
    preloadedThread?: ThreadRow;
  },
) => {
  const thread =
    options?.preloadedThread ??
    (await db.thread.one(input.threadId).get());
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  await db.thread.update(input.threadId, { agentRead: input.agentRead });

  return {
    thread: { ...thread, agentRead: input.agentRead },
  };
};
